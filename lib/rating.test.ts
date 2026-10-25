import assert from 'node:assert/strict';
import test from 'node:test';

import { BASE_RATING, currentRatingFrom, ratingCurvesFromGames } from './rating.ts';

test('an unrated player has no curve', () => {
  const curves = ratingCurvesFromGames([]);
  assert.equal(currentRatingFrom(curves, 1), null);
});

test('a guest seat moves nothing', () => {
  const curves = ratingCurvesFromGames([
    { whiteUserId: null, blackUserId: 2, result: '1-0', at: 1 },
    { whiteUserId: 3, blackUserId: null, result: '0-1', at: 2 },
  ]);
  assert.equal(currentRatingFrom(curves, 2), null);
  assert.equal(currentRatingFrom(curves, 3), null);
});

test('a NULL or unrecorded result moves nothing', () => {
  const curves = ratingCurvesFromGames([{ whiteUserId: 1, blackUserId: 2, result: null, at: 1 }]);
  assert.equal(currentRatingFrom(curves, 1), null);
});

test('a win raises the winner above the base rating', () => {
  const curves = ratingCurvesFromGames([{ whiteUserId: 1, blackUserId: 2, result: '1-0', at: 1 }]);
  const white = currentRatingFrom(curves, 1)!;
  const black = currentRatingFrom(curves, 2)!;
  assert.ok(white.rating > BASE_RATING, `white ${white.rating} should exceed base`);
  assert.ok(black.rating < BASE_RATING, `black ${black.rating} should fall below base`);
});

test('the curve is zero-sum in rating points (fixed K)', () => {
  const curves = ratingCurvesFromGames([
    { whiteUserId: 1, blackUserId: 2, result: '1-0', at: 1 },
    { whiteUserId: 2, blackUserId: 1, result: '1-0', at: 2 },
  ]);
  const white = currentRatingFrom(curves, 1)!;
  const black = currentRatingFrom(curves, 2)!;
  assert.equal(white.rating + black.rating, BASE_RATING * 2);
});

test('a draw between equals leaves both at base', () => {
  const curves = ratingCurvesFromGames([{ whiteUserId: 1, blackUserId: 2, result: '1/2-1/2', at: 1 }]);
  assert.equal(currentRatingFrom(curves, 1)!.rating, BASE_RATING);
  assert.equal(currentRatingFrom(curves, 2)!.rating, BASE_RATING);
});

test('the same games always produce the same curve, whatever the order given', () => {
  /* The caller is responsible for sorting by `at`; a shuffled feed would be a
     different (wrong) result, so both orderings are checked here to pin that
     contract down. */
  const games = [
    { whiteUserId: 1, blackUserId: 2, result: '1-0', at: 1 },
    { whiteUserId: 2, blackUserId: 1, result: '1-0', at: 2 },
    { whiteUserId: 1, blackUserId: 2, result: '1/2-1/2', at: 3 },
  ];
  const forward = ratingCurvesFromGames(games);
  const again = ratingCurvesFromGames([...games].reverse().sort((a, b) => a.at - b.at));
  assert.deepEqual(again.get(1)!.map((point) => point.rating), forward.get(1)!.map((point) => point.rating));
  assert.deepEqual(again.get(2)!.map((point) => point.rating), forward.get(2)!.map((point) => point.rating));
});

test('a fresh win takes the full provisional swing', () => {
  /* The ladder's first step and a one-off upset between fresh players are the
     same game on paper: both sides start at base, so both gain the full K. */
  const ladder = Array.from({ length: 10 }, (_, index) => ({
    whiteUserId: 2,
    blackUserId: 3,
    result: '1-0',
    at: index + 1,
  }));
  const upset = [{ whiteUserId: 4, blackUserId: 1, result: '1-0', at: 100 }];

  const fromLadder = ratingCurvesFromGames(ladder);
  const stepOfLadder = fromLadder.get(2)![0].rating - BASE_RATING;

  const fromUpset = ratingCurvesFromGames(upset);
  const stepOfUpset = fromUpset.get(4)![0].rating - BASE_RATING;

  assert.ok(stepOfUpset > 0, 'a win should gain points');
  assert.equal(stepOfUpset, stepOfLadder, 'both are first games at equal ratings');
});
