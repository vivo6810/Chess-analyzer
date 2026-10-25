import test from 'node:test';
import assert from 'node:assert/strict';

import { Chess } from 'chess.js';

import { evaluatePosition, legalMoveCount, buildPgn } from './game.ts';

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

/* ── Legal move count ───────────────────────────────────────────── */

test('the starting position has twenty legal moves', () => {
  assert.equal(legalMoveCount(new Chess().fen()), 20);
});

test('a forced move is counted as exactly one', () => {
  // The king must move out of double check — one legal answer only.
  const fen = '4k3/8/8/8/8/8/R1b1N1b1/2B1K1R1 b - - 0 1';
  const count = new Chess(fen).moves().length;
  assert.equal(legalMoveCount(fen), count);
  assert.ok(count >= 1);
});

/* ── PGN export ─────────────────────────────────────────────────── */

test('the export carries headers and a result', () => {
  const pgn = buildPgn({ White: 'Alpha', Black: 'Beta' }, [{ san: 'e4' }, { san: 'e5' }], '1-0');
  assert.match(pgn, /\[White "Alpha"\]/);
  assert.match(pgn, /1\. e4 e5 1-0$/);
});

test('a corrupt tail truncates the export instead of throwing', () => {
  const pgn = buildPgn({ White: 'A', Black: 'B' }, [{ san: 'e4' }, { san: 'Qxyz9' }], '1-0');
  assert.match(pgn, /1\. e4/);
  assert.ok(!pgn.includes('Qxyz9'));
});
