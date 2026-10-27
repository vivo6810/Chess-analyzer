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
