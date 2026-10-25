import { Chess } from 'chess.js';

/* Board rules only. Clocks, time controls and move application lived here
   once, for live play; the analysis app reads games instead of playing them,
   so everything that enforced a clock was removed with the database. */

export type GameOver = {
  result: '1-0' | '0-1' | '1/2-1/2';
  termination:
    | 'checkmate'
    | 'stalemate'
    | 'insufficient'
    | 'fifty-move'
    | 'repetition';
};

/** Classifies a finished position. Only board-determined endings live here. */
export function evaluatePosition(game: Chess): GameOver | null {
  if (!game.isGameOver()) return null;
  if (game.isCheckmate()) {
    return { result: game.turn() === 'w' ? '0-1' : '1-0', termination: 'checkmate' };
  }
  if (game.isStalemate()) return { result: '1/2-1/2', termination: 'stalemate' };
  if (game.isInsufficientMaterial()) return { result: '1/2-1/2', termination: 'insufficient' };
  if (game.isThreefoldRepetition()) return { result: '1/2-1/2', termination: 'repetition' };
  return { result: '1/2-1/2', termination: 'fifty-move' };
}

export function legalMoveCount(fen: string): number {
  return new Chess(fen).moves().length;
}

export function buildPgn(
  headers: Record<string, string>,
  moves: { san: string }[],
  result?: string,
): string {
  const game = new Chess();
  for (const [key, value] of Object.entries(headers)) game.setHeader(key, value);
  if (result) game.setHeader('Result', result);

  for (const move of moves) {
    try {
      game.move(move.san);
    } catch {
      break; // A corrupt tail should truncate the export, not throw.
    }
  }
  try {
    return game.pgn();
  } catch {
    return '';
  }
}
