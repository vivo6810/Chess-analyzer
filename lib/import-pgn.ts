import { Chess } from 'chess.js';

import { db, now, parseFingerprint, slugify, type MoveRecord } from './db.ts';
import { evaluatePosition } from './game.ts';
import { openingForMoves } from './openings.ts';
import { START_FEN } from './service.ts';
import { ServiceError } from './service-error.ts';
import { isTimeControlId } from './time-controls.ts';

/**
 * PGN import.
 *
 * Import is speculative data: the game did not happen on this board, so the
 * parser's job is to be sceptical — play every move through `chess.js`, derive
 * what the headers do not carry, and refuse the whole thing loudly at the
 * first line it cannot play. A half-imported game would be worse than an
 * error message.
 *
 * Each parsed game carries a fingerprint (who played, what was played, what it
 * scored), and the table holds a unique index on it — that is the whole
 * duplicate story.
 */

export type ParsedGame = {
  white: string;
  black: string;
  result: '1-0' | '0-1' | '1/2-1/2';
  termination: string | null;
  timeControl: string;
  startFen: string;
  eventName: string | null;
  moves: MoveRecord[];
  /** Computed here so the commit can skip duplicates before touching the table. */
  fingerprint: string;
};

export type ImportOutcome = {
  imported: { id: number; white: string; black: string; result: string }[];
  skipped: number;
};

const HEADER_LINE = /^\[\s*(\w+)\s+"([^"]*)"\s*\]\s*$/;

/** Strips comments, line comments, variations and NAGs, leaving bare movetext. */
function movetextOf(block: string): string {
  let text = block
    .split('\n')
    .filter((line) => !HEADER_LINE.test(line))
    .join('\n');

  text = text.replace(/;[^\n]*/g, ' '); // line comments
  text = text.replace(/\{[^}]*\}/g, ' '); // brace comments

  // Parenthesised variations nest; cut the innermost pair until none is left.
  while (/\([^()]*\)/.test(text)) text = text.replace(/\([^()]*\)/g, ' ');

  text = text.replace(/\$\d+/g, ' '); // NAGs
  return text;
}

/**
 * The SAN tokens of the movetext, move numbers and annotations gone.
 *
 * The result token is deliberately kept: a headerless game records its result
 * nowhere else, so the caller reads the token and then drops it before play.
 */
function sanTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/^\d+\.(\.\.)?/, '').replace(/[!?,]+$/, ''))
    .filter((bare) => bare.length > 0);
}

const RESULT_VALUES: Record<string, '1-0' | '0-1' | '1/2-1/2'> = {
  '1-0': '1-0',
  '0-1': '0-1',
  '1/2-1/2': '1/2-1/2',
};

const finishOf = (chess: Chess): '1-0' | '0-1' | '1/2-1/2' | null => {
  if (chess.isGameOver()) {
    return chess.turn() === 'w' ? '0-1' : '1-0';
  }
  return null;
};

const safeName = (value: string | undefined): string | null => {
  const name = value?.trim();
  return name ? name.slice(0, 60) : null;
};

/**
 * Parses and validates one game block.
 *
 * Throws `ServiceError` with a message that names the first failing move, so
 * the importer can find the bad line instead of guessing at a whole file.
 */
export function parseOneGame(block: string): ParsedGame {
  const headers: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const match = HEADER_LINE.exec(line.trim());
    if (match) headers[match[1]] = match[2];
  }

  let chess: Chess;
  const headerFen = headers.FEN?.trim();
  const usesCustomStart = Boolean(headerFen);
  try {
    if (usesCustomStart) {
      chess = new Chess(headerFen);
    } else {
      chess = new Chess();
    }
  } catch {
    throw new ServiceError('The FEN header of this game is not a valid position.');
  }

  /* One token pass: the tail may be a result token, which is not a move. */
  const tokens = sanTokens(movetextOf(block));
  const resultToken = tokens.length > 0 && (tokens[tokens.length - 1] in RESULT_VALUES || tokens[tokens.length - 1] === '*')
    ? tokens.pop()
    : undefined;

  if (tokens.length === 0) {
    throw new ServiceError('A game needs at least one move.');
  }

  const moves: MoveRecord[] = [];
  const timestamp = now();
  for (let index = 0; index < tokens.length; index += 1) {
    const san = tokens[index];
    try {
      const applied = chess.move(san);
      moves.push({
        san: applied.san,
        uci: `${applied.from}${applied.to}${applied.promotion ?? ''}`,
        fen: chess.fen(),
        at: timestamp,
        whiteMs: 0,
        blackMs: 0,
      });
    } catch {
      throw new ServiceError(`Move ${index + 1} ("${san}") is not legal in the position before it.`);
    }
  }

  /* The stated result: the header wins, then the movetext's own result
     token. A `*` and a missing tag are the same thing — the position decides. */
  const headerResult = RESULT_VALUES[headers.Result?.trim() ?? ''];
  const stated = headerResult ?? RESULT_VALUES[resultToken ?? ''] ?? null;

  /* A result the header does not carry may still be readable from the final
     position — checkmate says who won even when the tags were stripped. */
  if (stated) {
    // Use the stated one only when the position does not contradict a mate.
    const over = finishOf(chess);
    if (chess.isCheckmate() && over && over !== stated) {
      throw new ServiceError('The stated result contradicts the final position (checkmate the other way).');
    }
  }

  const result =
    stated ??
    (chess.isStalemate() ||
    chess.isInsufficientMaterial() ||
    chess.isThreefoldRepetition() ||
    chess.isDraw()
      ? '1/2-1/2'
      : finishOf(chess));

  if (!result) {
    throw new ServiceError('Import finished games only — this one has no result and is not over.');
  }

  /* Moves the exporter wrote in SAN may belong to the frozen library; the ECO
     table is the honest opportunistic labeller. */
  const opening = openingForMoves(moves.map((move) => move.san));

  const white = safeName(headers.White) ?? 'Unknown';
  const black = safeName(headers.Black) ?? 'Unknown';

  return {
    white,
    black,
    result,
    termination: evaluatePosition(chess)?.termination ?? null,
    timeControl: headers.TimeControl && isTimeControlId(headers.TimeControl.trim())
      ? headers.TimeControl.trim()
      : 'untimed',
    startFen: usesCustomStart ? headerFen! : START_FEN,
    eventName: safeName(headers.Event),
    moves,
    fingerprint: parseFingerprint([white, black, moves.map((move) => move.san).join(' '), result]),
  };
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
  if (!trimmed) throw new ServiceError('Paste a PGN first.');

  const blocks = splitPgn(trimmed);
  if (blocks.length === 0) throw new ServiceError('No games found in that PGN.');

  return blocks.map((block, index) => {
    try {
      return parseOneGame(block);
    } catch (error) {
      if (error instanceof ServiceError && blocks.length > 1) {
        throw new ServiceError(`Game ${index + 1}: ${error.message}`);
      }
      throw error;
    }
  });
}

/**
 * Files the parsed games under a per-user container.
 *
 * Seat names are linked to accounts exactly the way play links them: a header
 * name that matches a username *is* that account's game, which is what lets an
 * import of someone's real games show up on their profile. The fingerprint
 * unique index is the deduplication; insert failures count as skips rather
 * than errors, because arriving twice is the expected way to import doubly.
 */
export function commitImport(userId: number, username: string, games: ParsedGame[]): ImportOutcome {
  if (games.length === 0) throw new ServiceError('No games found in that PGN.');

  const containerName = `Imported games — ${username}`.slice(0, 80);
  const timestamp = now();

  return dbTransaction(() => {
    /* A second import builds its own container, so the slug — a UNIQUE column
       — needs the same collision suffix the seeding path uses. */
    const slug = slugify(containerName);
    const info = db
      .prepare(
        `INSERT INTO tournaments
           (slug, name, host_id, format, time_control, total_rounds, status, current_round,
            kind, created_at)
         VALUES (?, ?, ?, 'round_robin', ?, 0, 'finished', 0, 'import', ?)`,
      )
      .run(slug, containerName, userId, games[0].timeControl, timestamp);
    const containerId = Number(info.lastInsertRowid);

    /* Unique seat names, first occurrence wins. */
    const names: string[] = [];
    for (const game of games) {
      for (const name of [game.white, game.black]) {
        if (!names.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
          names.push(name);
        }
      }
    }

    /* withdrawn is 0 by design; user_id is parameterised because a header
       name that matches a username IS that account's seat. */
    const insertSeat = db.prepare(
      `INSERT INTO tournament_players (tournament_id, name, user_id, seed, withdrawn, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    );
    const findUser = db.prepare('SELECT id FROM users WHERE username_key = ?');
    const seatIdByName = new Map<string, number>();
    names.forEach((name, index) => {
      const user = findUser.get(name.trim().toLowerCase()) as { id: number } | undefined;
      const seatInfo = insertSeat.run(containerId, name, user?.id ?? null, index + 1, timestamp);
      seatIdByName.set(name.toLowerCase(), Number(seatInfo.lastInsertRowid));
    });

    const insertGame = db.prepare(
      `INSERT INTO games
         (tournament_id, white_player_id, black_player_id, time_control, fen, start_fen, moves,
          status, result, termination, source, opening, fingerprint,
          white_ms, black_ms, increment_ms, per_move_ms, turn_started_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'finished', ?, ?, 'import', ?, ?,
               0, 0, 0, 0, ?, ?, ?)`,
    );

    const imported: ImportOutcome['imported'] = [];
    let skipped = 0;

    for (const game of games) {
      const whiteId = seatIdByName.get(game.white.toLowerCase());
      const blackId = seatIdByName.get(game.black.toLowerCase());
      if (!whiteId || !blackId) {
        throw new ServiceError('Seats failed to resolve. Aborting the import.');
      }

      const movesJson = JSON.stringify(game.moves);
      try {
        const gameInfo = insertGame.run(
          containerId,
          whiteId,
          blackId,
          game.timeControl,
          game.moves[game.moves.length - 1]?.fen ?? game.startFen,
          game.startFen,
          movesJson,
          game.result,
          game.termination,
          openingForMoves(game.moves.map((move) => move.san)),
          game.fingerprint,
          timestamp,
          timestamp,
          timestamp,
        );
        imported.push({
          id: Number(gameInfo.lastInsertRowid),
          white: game.white,
          black: game.black,
          result: game.result,
        });
      } catch {
        // The unique index on fingerprint rejected it: already on file.
        skipped += 1;
      }
    }

    return { imported, skipped };
  });
}

/** A transaction helper local to this module — `service.ts` keeps its own. */
function dbTransaction<T>(work: () => T): T {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
