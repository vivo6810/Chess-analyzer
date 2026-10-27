/**
 * Move grading — the Expected Points model.
 *
 * A move is no longer graded by raw centipawn loss alone. Each position is
 * first converted into *expected points* — the player's likely game score
 * (1 win, ½ draw, 0 loss) given the evaluation and the mover's own rating, so
 * the same evaluation means different things to a 700- and a 2300-rated
 * player. The verdict then falls out of how much expected points the move
 * spent, with rules beyond expected points for the special verdicts
 * (brilliant sacrifice, great, book and miss) — exactly Chess.com's
 * Classification V2 vocabulary: brilliant, great, best, excellent, good,
 * book, inaccuracy, mistake, miss, blunder. There is no `forced` badge; the
 * only legal move grades on its own quality like any other move.
 */

import { Chess } from 'chess.js';
import { OPENINGS } from './openings.ts';

/* ── Expected points cutoffs (Chess.com's published table) ──────────
   A move loses between the limits and inherits the verdict:
   best 0 · excellent ≤0.02 · good ≤0.05 · inaccuracy ≤0.10 ·
   mistake ≤0.20 · blunder >0.20. */
export const EP_CUTOFFS = {
  excellent: 0.02,
  good: 0.05,
  inaccuracy: 0.1,
  mistake: 0.2,
} as const;

/** Expected-points bands that define a "winning" position on the EP scale. */
export const WIN_EP = 0.75;
/* The equal band the Great-move rules swing across. */
const EQUAL_LO_EP = 0.35;
const EQUAL_HI_EP = 0.65;

export type MoveVerdict =
  | 'brilliant'
  | 'great'
  | 'book'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

/* ── The expected-points curve ───────────────────────────────────────
   Decisive share follows a logistic in centipawns; a draw cushion around
   equality pulls the curve's ends toward 0.5, so EP is even-ish well past
   one pawn and only approaches 0/1 as the evaluation becomes absolute.
   Steepness scales with the mover's rating: a higher-rated player converts
   an advantage more reliably, so their curve is steeper and the same eval
   counts for more of their expected score. Unknown ratings sit at ~1500. */
function steepness(rating?: number | null): number {
  const clamped = Math.max(400, Math.min(2800, rating ?? 1500));
  return 0.75 + ((clamped - 400) / 2400) * 0.5;
}

/**
 * Expected points from the evaluation as seen *by the side that moved*
 * (centipawns), adjusted to that player's rating.
 */
export function expectedPoints(cp: number, rating?: number | null): number {
  if (!Number.isFinite(cp)) return 0.5;
  /* Mates arrive as ±10000 through the review's cp collection. */
  if (Math.abs(cp) >= 9000) return cp > 0 ? 1 : 0;
  const decisive = 1 / (1 + Math.exp(-0.00368208 * steepness(rating) * cp));
  const drawShare = 0.3 * Math.exp(-((cp / 1100) ** 2));
  const ep = decisive * (1 - drawShare) + 0.5 * drawShare;
  return Math.max(0, Math.min(1, ep));
}

/**
 * A move whose sequence still sits inside the curated opening table — a
 * conventional opening move, which is judged as "book" rather than by its
 * evaluation.
 */
export function isBookMove(sans: string[]): boolean {
  if (sans.length === 0 || sans.length > 24) return false;
  return OPENINGS.some((opening) =>
    opening.sans.length >= sans.length &&
    sans.every((san, index) => opening.sans[index] === san),
  );
}

/**
 * Labels a move from the expected points the position entailed before and
 * after it, plus the facts expected points cannot see on their own:
 *
 *   - `brilliant` — a good piece sacrifice that is not played from a bad
 *     position and not from a position that was already crushing.
 *   - `great` — the move swung the game across an equal/losing or
 *     equal/winning boundary while staying near-best.
 *   - `miss` — the position was winning before the move and no longer is
 *     after it: the win was there to take and was not taken.
 *   - `book` — a conventional opening move, judged as book instead of by
 *     its evaluation when it holds its own.
 *
 * The only legal move is graded like every other move — chess.com carries
 * no `forced` classification, so neither does this verdict set.
 */
export function classifyMove(
  expectedBefore: number,
  expectedAfter: number,
  context: {
    matchesBestMove?: boolean;
    sacrifice?: boolean;
    book?: boolean;
  } = {},
): MoveVerdict {
  /* The loss is measured against the position's own best line, so a move
     that improves on a losing position costs nothing even if it is not
     the engine's top choice. */
  const loss = Math.max(0, Math.min(1, expectedBefore - expectedAfter));
  if (context.sacrifice && loss <= EP_CUTOFFS.good && expectedAfter >= 0.4 && expectedBefore <= 0.85) {
    return 'brilliant';
  }
  if (
    loss <= EP_CUTOFFS.excellent &&
    ((expectedBefore < EQUAL_LO_EP && expectedAfter >= EQUAL_LO_EP) ||
      (expectedBefore <= EQUAL_HI_EP && expectedAfter > EQUAL_HI_EP))
  ) {
    return 'great';
  }
  if (expectedBefore >= WIN_EP && expectedAfter < WIN_EP) return 'miss';
  if (context.book && loss <= EP_CUTOFFS.good) return 'book';
  if (context.matchesBestMove || loss <= 0.004) return 'best';
  if (loss <= EP_CUTOFFS.excellent) return 'excellent';
  if (loss <= EP_CUTOFFS.good) return 'good';
  if (loss <= EP_CUTOFFS.inaccuracy) return 'inaccuracy';
  if (loss <= EP_CUTOFFS.mistake) return 'mistake';
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
 * Accuracy from expected points (the CAPS2 spirit).
 *
 * Each move is graded on the expected points it spent relative to the
 * position's own best line, and the game's score is a gentle exponential of
 * the average — so most of a real human game lands between 50 and 95 instead
 * of the old single digits, while a perfect game stays 100. Measuring in
 * expected points makes the scale rating-aware for free: a 700-rated player
 * loses less expected score than a 2300-rated one dropping the same eval.
 *
 * This is an approximation, not chess.com's proprietary CAPS2 curve — the
 * shape and intent follow their published description.
 */
export function accuracyFromLosses(expectedPointLosses: number[]): number {
  if (expectedPointLosses.length === 0) return 0;
  const averageLoss = expectedPointLosses.reduce((sum, loss) => sum + Math.max(0, Math.min(1, loss)), 0)
    / expectedPointLosses.length;
  const accuracy = 100 * Math.exp(-2.2 * averageLoss);
  return Math.max(0, Math.min(100, Number(accuracy.toFixed(1))));
}
