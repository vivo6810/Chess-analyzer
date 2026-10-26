import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  averageAccuracy,
  averageBlundersPerMatch,
  averageGameRating,
} from './profile-metrics.ts';

test('average game rating rounds the mean of rated games', () => {
  assert.equal(averageGameRating([1800, 1901, 1999]), 1900);
  assert.equal(averageGameRating([]), null);
});

test('average blunders per match is player blunders divided by analyzed games', () => {
  assert.equal(averageBlundersPerMatch(5, 2), 2.5);
  assert.equal(averageBlundersPerMatch(0, 4), 0);
  assert.equal(averageBlundersPerMatch(5, 0), null);
});

test('average accuracy is the mean per-game accuracy', () => {
  assert.equal(averageAccuracy(171.4, 2), 85.7);
  assert.equal(averageAccuracy(0, 0), null);
});
