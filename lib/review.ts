/**
 * Move grading.
 *
 * The thresholds and accuracy estimates are arithmetic; sacrifice detection
 * uses chess.js only to check the immediate capture-and-recapture sequence.
 */

/** Centipawn-loss thresholds used to label a move in the review. */
export const BLUNDER_CP = 200;
export const MISTAKE_CP = 100;
export const INACCURACY_CP = 50;
export const EXCELLENT_CP = 20;

export type MoveVerdict =
  | 'forced'
  | 'brilliant'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

/**
 * Labels a move from what it cost, plus the two facts centipawns cannot tell
 * you on their own:
 *
 *   - `forced` — there was only one legal move, so there was no decision to get
 *     wrong. Checked first on purpose: a forced move often shows a non-zero
 *     loss, because the engine's best line from the position before it was a
 *     move that was not available.
 *   - `best` — the player found the engine's own first choice. That is a
 *     stronger statement than "lost nothing", and the two are not the same
 *     thing: a quiet position can have six moves that all hold.
 *
 * Everything else falls out of the loss.
 */
export function classifyMove(
  centipawnLoss: number,
  context: { onlyMove?: boolean; matchesBestMove?: boolean; sacrifice?: boolean } = {},
): MoveVerdict {
  if (context.onlyMove) return 'forced';
  if (context.sacrifice && centipawnLoss < EXCELLENT_CP) return 'brilliant';
  if (context.matchesBestMove) return 'best';
  if (centipawnLoss < EXCELLENT_CP) return 'excellent';
  if (centipawnLoss < INACCURACY_CP) return 'good';
  if (centipawnLoss < MISTAKE_CP) return 'inaccuracy';
  if (centipawnLoss < BLUNDER_CP) return 'mistake';
  return 'blunder';
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/**
 * Detects a material sacrifice using only the forced capture and immediate
 * recaptures. This intentionally avoids deeper engine lines so the label is
 * deterministic and does not claim that every positional sacrifice is sound.
 */
export function detectSacrifice(fenAfter: string, opponentBestUci: string | null): boolean {
  /* Without a concrete opponent move there is no observable material offer. */
  if (!opponentBestUci) return false;

  /* Load the exact post-move position; invalid PGN data cannot earn a label. */
  let game: Chess;
  try {
    game = new Chess(fenAfter);
  } catch {
    return false;
  }

  const from = opponentBestUci.slice(0, 2);
  const to = opponentBestUci.slice(2, 4);
  const promotion = opponentBestUci[4];
  try {
    /* The engine's reply must actually take the offered piece. */
    const capture = game.move({ from, to, ...(promotion ? { promotion } : {}) });
    if (!capture.captured) return false;

    /* Value only the material the opponent won on this immediate capture. */
    const gain = PIECE_VALUE[capture.captured] ?? 0;
    /* Count the strongest one-move recapture available to the sacrificer. */
    let claw = 0;
    for (const reply of game.moves({ verbose: true })) {
      if (reply.captured) claw = Math.max(claw, PIECE_VALUE[reply.captured] ?? 0);
    }
    /* A minor-piece offer that remains down a minor piece is a sacrifice. */
    return gain >= 3 && gain - claw >= 3;
  } catch {
    return false;
  }
}

/**
 * Maps the average centipawn loss onto a 0-100 accuracy figure. The exponential
 * shape punishes the tail, so one 400cp blunder moves the number more than four
 * separate 100cp mistakes do.
 */
export function accuracyFromLoss(averageCentipawnLoss: number, moveCount: number): number {
  if (moveCount === 0) return 0;
  const volatility = Math.min(1, moveCount / 40);
  const raw = 103.1668 * Math.exp(-0.04354 * averageCentipawnLoss) - 3.1669;
  const blended = raw * (0.7 + 0.3 * volatility);
  return Math.max(0, Math.min(100, Number(blended.toFixed(1))));
}

import { Chess } from 'chess.js';
