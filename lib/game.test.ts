import test from 'node:test';
import assert from 'node:assert/strict';

import { Chess } from 'chess.js';

import { evaluatePosition } from './game.ts';

/* ── Board-determined endings ───────────────────────────────────── */

test('checkmate decides the result by the side that is mated', () => {
  const game = new Chess();
  // Fool's mate.
  game.move('f3');
  game.move('e5');
  game.move('g4');
  game.move('Qh4');
  assert.deepEqual(evaluatePosition(game), { result: '0-1', termination: 'checkmate' });
});

test('stalemate is a draw', () => {
  /* Black king a8 has every escape square hit by the queen on b6 — no check,
     no move, no mate. The position is already stalemated when it is loaded. */
  const game = new Chess('k7/8/1Q6/8/8/8/8/K7 b - - 0 1');
  const over = evaluatePosition(game);
  assert.equal(over?.termination, 'stalemate');
  assert.equal(over?.result, '1/2-1/2');
});

test('an open position is not over', () => {
  assert.equal(evaluatePosition(new Chess()), null);
});
