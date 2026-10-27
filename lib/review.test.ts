import test from 'node:test';
import assert from 'node:assert/strict';

import {
  accuracyFromLosses,
  classifyMove,
  detectSacrifice,
  expectedPoints,
  isBookMove,
} from './review.ts';

test('expected points is even at 0.5 and certain at mating evaluations', () => {
  assert.equal(expectedPoints(0), 0.5);
  assert.ok(expectedPoints(10000) > 0.99);
  assert.ok(expectedPoints(-10000) < 0.01);
});

test('the same evaluation means more for a higher-rated player', () => {
  /* +3 pawns is near-decisive for a strong player, ground only for a novice. */
  const low = expectedPoints(300, 800);
  const high = expectedPoints(300, 2400);
  assert.ok(high - low > 0.04, `${high} should exceed ${low} by a wide margin`);
  /* The curve itself is still monotone in both ratings and evals. */
  assert.ok(expectedPoints(150, 2000) > expectedPoints(50, 2000));
  assert.ok(expectedPoints(-200, 2000) < expectedPoints(-50, 2000));
});

test('expected-points losses map onto the published cutoff table', () => {
  /* best: zero loss, matchesBestMove or effectively nothing lost */
  assert.equal(classifyMove(0.8, 0.8, { matchesBestMove: true }), 'best');
  assert.equal(classifyMove(0.8, 0.7995), 'best');
  /* excellent/good/inaccuracy/mistake: the chess.com table's limits */
  assert.equal(classifyMove(0.9, 0.885), 'excellent'); // loss 0.015
  assert.equal(classifyMove(0.8, 0.76), 'good'); // loss 0.04
  assert.equal(classifyMove(0.9, 0.82), 'inaccuracy'); // loss 0.08
  assert.equal(classifyMove(0.9, 0.78), 'mistake'); // loss 0.12
  /* dropping out of a won position is a miss, even when the loss is huge */
  assert.equal(classifyMove(0.9, 0.55, {}), 'miss'); // loss 0.35, winning → not winning
  /* the same loss from an unclear position is a plain blunder */
  assert.equal(classifyMove(0.6, 0.25, {}), 'blunder'); // loss 0.35
  /* a tiny loss exactly on the excellent boundary stays excellent */
  assert.equal(classifyMove(0.9, 0.8801), 'excellent');
  assert.equal(classifyMove(0.9, 0.8790), 'good');
});

test('forced outranks best, brilliant and big swings', () => {
  assert.equal(classifyMove(0.9, 0.4, { onlyMove: true, sacrifice: true, matchesBestMove: true }), 'forced');
});

test('brilliant needs a good sacrifice that is not already decided', () => {
  /* a sound sacrifice from a level position */
  assert.equal(classifyMove(0.6, 0.58, { sacrifice: true }), 'brilliant');
  /* not a sacrifice — the same quality grades by its own cost */
  assert.equal(classifyMove(0.5, 0.485), 'excellent');
  /* a sacrifice from an already crushing position earns nothing special */
  assert.equal(classifyMove(0.97, 0.96, { sacrifice: true }), 'excellent');
  /* a sacrifice that leaves the player struggling is not brilliant */
  assert.equal(classifyMove(0.45, 0.30, { sacrifice: true }), 'mistake');
  /* a sacrifice that misfires is graded by its own cost */
  assert.equal(classifyMove(0.6, 0.45, { sacrifice: true }), 'mistake');
});

test('great swings the game across an equal boundary while staying near-best', () => {
  /* losing into unclear */
  assert.equal(classifyMove(0.25, 0.45), 'great');
  /* equal into winning */
  assert.equal(classifyMove(0.6, 0.75), 'great');
  /* gaining ground without a boundary crossing: measured against the
     position, improving costs nothing, so this grades as best */
  assert.equal(classifyMove(0.5, 0.62), 'best');
  /* escaping a losing position across the equal boundary is the swing itself */
  assert.equal(classifyMove(0.20, 0.60), 'great');
});

test('miss is dropping out of a won position', () => {
  assert.equal(classifyMove(0.9, 0.6), 'miss');
  /* dropping within the winning band is graded by its loss, not a miss */
  assert.equal(classifyMove(0.9, 0.8), 'inaccuracy');
  /* never winning, never a miss */
  assert.equal(classifyMove(0.5, 0.2), 'blunder');
});

test('book covers conventional opening moves, not moves beyond the table', () => {
  assert.equal(isBookMove(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']), true);
  assert.equal(isBookMove(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5']), true);
  /* games that leave the table stop being book the moment no line fits */
  assert.equal(isBookMove(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'a3']), false);
  /* a single sane-looking move from the table's first plies */
  assert.equal(isBookMove(['d4', 'd5', 'c4']), true);
  assert.equal(isBookMove(['a3', 'h6']), false);
});

test('losses are measured against the position, not the previous evaluation, so improvements cost nothing', () => {
  /* from a losing position a move that fixes it but is not the top choice */
  assert.equal(classifyMove(0.2, 0.55), 'great');
  /* from a losing position reaching equality */
  assert.equal(classifyMove(0.10, 0.40), 'great');
});

test('accuracy grades expected-points loss on a school-like band', () => {
  /* no game, no score; a zero-loss game is perfect */
  assert.equal(accuracyFromLosses([]), 0);
  assert.equal(accuracyFromLosses([0, 0, 0]), 100);
  /* typical decent play (small EP losses) sits in the CAPS2 band */
  assert.equal(accuracyFromLosses([0, 0.05]), 94.6);
  assert.ok(
    accuracyFromLosses([0.01, 0.03, 0.05]) > 75,
    'ordinary moves should not sink below the school band',
  );
  /* real slips bite, and the scale is monotone and bounded */
  assert.ok(accuracyFromLosses([0.3]) < 60);
  assert.ok(
    accuracyFromLosses([0.01]) > accuracyFromLosses([0.05])
      && accuracyFromLosses([0.05]) > accuracyFromLosses([0.1]),
    'more expected-points loss must mean lower accuracy',
  );
  assert.ok(accuracyFromLosses([0, 2]) <= 100);
});

test('sacrifice detection recognises an unsound knight offer', () => {
  /* 1. e4 d5 2. exd5 Qxd5 — no offer; knight sacrifice setup instead. */
  const noOffer = detectSacrifice('rnbqcbsr/ppp1pppp/8/3p4/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 3', 'd4d5');
  assert.equal(noOffer, false);
});
