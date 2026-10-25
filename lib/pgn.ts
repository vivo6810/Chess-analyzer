import { Chess } from 'chess.js';

import { openingForMoves } from './openings.ts';

/**
 * PGN parsing, with no database behind it.
 *
 * A pasted or fetched game is speculative data: it did not happen on this
 * board, so the parser's job is to be sceptical — play every move through
 * `chess.js`, derive what the headers do not carry, and refuse the whole
 * thing loudly at the first move it cannot play. A half-parsed game would
 * be worse than an error message.
 */

export type PgnMove = {
  san: string;
  uci: string;
  fen: string;
  /** Seconds remaining on the mover's clock after this move, when the PGN
   * carries `[%clk]` annotations (every Chess.com archive does). */
  clk?: number;
};

export type ParsedGame = {
  white: string;
  black: string;
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  termination: string | null;
  timeControl: string | null;
  startFen: string;
  eventName: string | null;
  site: string | null;
  playedAt: string | null;
  opening: string | null;
  moves: PgnMove[];
};

/** The parser's own error type so callers can show the message, not a stack. */
export class PgnError extends Error {}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const HEADER_LINE = /^\[\s*(\w+)\s+"([^"]*)"\s*\]\s*$/;

function movetextOf(block: string): string {
  let text = block
    .split('\n')
    .filter((line) => !HEADER_LINE.test(line))
    .join('\n');

  text = text.replace(/;[^\n]*/g, ' '); // line comments

  // Parenthesised variations nest; cut the innermost pair until none is left.
  while (/\([^()]*\)/.test(text)) text = text.replace(/\([^()]*\)/g, ' ');

  return text;
}

/**
 * The SAN tokens of the movetext plus, attached to each move, the `[%clk]`
 * comment that follows it (if any).
 *
 * Brace comments survive this pass on purpose: they are the clock annotations.
 * The result token is deliberately kept: a headerless game records its result
 * nowhere else, so the caller reads the token and then drops it before play.
 */
const TOKEN_PATTERN = /\{[^}]*\}|[^\s]+/g;

const CLOCK_COMMENT = /%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)/;

const isMoveNumber = (token: string) => /^\d+\.{1,3}$/.test(token) || /^\d+$/.test(token);

function tokensWithClocks(text: string): { san: string; clk: number | undefined }[] {
  const tokens = [...text.matchAll(TOKEN_PATTERN)].map((match) => match[0]);

  const moves: { san: string; clk: number | undefined }[] = [];
  for (const raw of tokens) {
    if (raw.startsWith('{')) {
      const clock = CLOCK_COMMENT.exec(raw);
      if (clock && moves.length > 0 && moves[moves.length - 1].clk === undefined) {
        const [, h, m, s] = clock;
        moves[moves.length - 1].clk = Number(h) * 3600 + Number(m) * 60 + Number(s);
      }
      continue;
    }
    if (/^\$\d+$/.test(raw)) continue; // NAGs
    /* Only a digit run followed by dots is a move number — '1.' or '1...'.
       Stripping bare digits would shred the result tokens '1-0' and
       '1/2-1/2', which both start with a digit. */
    const san = raw.replace(/^\d+\.{1,3}/, '').replace(/[!?,]+$/, '');
    if (san.length === 0 || isMoveNumber(raw)) continue;
    moves.push({ san, clk: undefined });
  }
  return moves;
}

const RESULT_VALUES: Record<string, '1-0' | '0-1' | '1/2-1/2'> = {
  '1-0': '1-0',
  '0-1': '0-1',
  '1/2-1/2': '1/2-1/2',
};

const finishOf = (chess: Chess): '1-0' | '0-1' | null => {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? '0-1' : '1-0';
  }
  return null;
};

const safeText = (value: string | undefined): string | null => {
  const text = value?.trim();
  return text ? text.slice(0, 80) : null;
};

/**
 * Parses and validates one game block.
 *
 * Throws `PgnError` with a message that names the first failing move, so the
 * UI can point at the bad line instead of guessing at a whole file.
 */
export function parseOneGame(block: string): ParsedGame {
  const headers: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const match = HEADER_LINE.exec(line.trim());
    if (match) headers[match[1]] = match[2];
  }

  const headerFen = headers.FEN?.trim();
  const usesCustomStart = Boolean(headerFen);
  let chess: Chess;
  try {
    chess = usesCustomStart ? new Chess(headerFen) : new Chess();
  } catch {
    throw new PgnError('The FEN header of this game is not a valid position.');
  }

  /* One token pass: the tail may be a result token, which is not a move. */
  const tokenList = tokensWithClocks(movetextOf(block));
  const resultToken =
    tokenList.length > 0 &&
    (tokenList[tokenList.length - 1].san in RESULT_VALUES || tokenList[tokenList.length - 1].san === '*')
      ? tokenList.pop()!.san
      : undefined;

  if (tokenList.length === 0) {
    // Chess.com archives ship empty PGNs for some unplayed pairings.
    throw new PgnError('A game needs at least one move.');
  }

  const moves: PgnMove[] = [];
  for (let index = 0; index < tokenList.length; index += 1) {
    const { san, clk } = tokenList[index];
    try {
      const applied = chess.move(san);
      moves.push({
        san: applied.san,
        uci: `${applied.from}${applied.to}${applied.promotion ?? ''}`,
        fen: chess.fen(),
        clk,
      });
    } catch {
      throw new PgnError(`Move ${index + 1} ("${san}") is not legal in the position before it.`);
    }
  }

  /* The stated result: the header wins, then the movetext's own result
     token. A `*` and a missing tag are the same thing — the position decides. */
  const headerResult = RESULT_VALUES[headers.Result?.trim() ?? ''];
  const stated = headerResult ?? RESULT_VALUES[resultToken ?? ''];

  /* A result the header does not carry may still be readable from the final
     position — checkmate says who won even when the tags were stripped. */
  if (stated && chess.isCheckmate()) {
    const over = finishOf(chess);
    if (over && over !== stated) {
      throw new PgnError('The stated result contradicts the final position (checkmate the other way).');
    }
  }

  const result: ParsedGame['result'] =
    stated ??
    (chess.isStalemate() ||
    chess.isInsufficientMaterial() ||
    chess.isThreefoldRepetition() ||
    chess.isDraw()
      ? '1/2-1/2'
      : (finishOf(chess) ?? '*'));

  const white = safeText(headers.White) ?? 'Unknown';
  const black = safeText(headers.Black) ?? 'Unknown';

  return {
    white,
    black,
    result,
    termination: evaluateTermination(chess),
    timeControl: safeText(headers.TimeControl),
    startFen: usesCustomStart ? headerFen! : START_FEN,
    eventName: safeText(headers.Event),
    site: safeText(headers.Site),
    playedAt: safeText(headers.UTCDate ?? headers.Date),
    opening: openingForMoves(moves.map((move) => move.san)),
    moves,
  };
}

/** Board-determined endings, labelled the way the review shows them. */
function evaluateTermination(chess: Chess): string | null {
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isInsufficientMaterial()) return 'insufficient';
  if (chess.isThreefoldRepetition()) return 'repetition';
  if (chess.isGameOver()) return 'fifty-move';
  return null;
}

/**
 * Splits a PGN blob into single-game blocks.
 *
 * A new block starts at a header line seen after movetext has begun. Files
 * without headers are still one game each: leading movetext without any tag
 * round-trips as a headerless game.
 */
export function splitPgn(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[][] = [];
  let current: string[] = [];
  let movetextStarted = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isHeader = HEADER_LINE.test(trimmed);
    if (isHeader && movetextStarted) {
      if (current.length > 0) blocks.push(current);
      current = [];
      movetextStarted = false;
    }
    if (!isHeader) movetextStarted = true;
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);

  return blocks.map((block) => block.join('\n'));
}

/** Parses a whole blob, refusing at the first game it cannot play. */
export function parsePgn(text: string): ParsedGame[] {
  const trimmed = text.trim();
  if (!trimmed) throw new PgnError('Paste a PGN first.');

  const blocks = splitPgn(trimmed);
  if (blocks.length === 0) throw new PgnError('No games found in that PGN.');

  return blocks.map((block, index) => {
    try {
      return parseOneGame(block);
    } catch (error) {
      if (error instanceof PgnError && blocks.length > 1) {
        throw new PgnError(`Game ${index + 1}: ${error.message}`);
      }
      throw error;
    }
  });
}
