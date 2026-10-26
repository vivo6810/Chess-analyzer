import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyMove, detectSacrifice } from './review.ts';

test('move loss thresholds retain their specified labels', () => {
  assert.equal(classifyMove(0), 'excellent');
  assert.equal(classifyMove(19), 'excellent');
  assert.equal(classifyMove(20), 'good');
  assert.equal(classifyMove(49), 'good');
  assert.equal(classifyMove(50), 'inaccuracy');
  assert.equal(classifyMove(99), 'inaccuracy');
  assert.equal(classifyMove(100), 'mistake');
  assert.equal(classifyMove(199), 'mistake');
  assert.equal(classifyMove(200), 'blunder');
});

test('forced moves outrank best and brilliant, while accurate sacrifices outrank best', () => {
  assert.equal(classifyMove(0, { onlyMove: true, matchesBestMove: true, sacrifice: true }), 'forced');
  assert.equal(classifyMove(0, { matchesBestMove: true }), 'best');
  assert.equal(classifyMove(19, { matchesBestMove: true, sacrifice: true }), 'brilliant');
  assert.equal(classifyMove(20, { matchesBestMove: true, sacrifice: true }), 'best');
});

test('a knight captured without immediate recapture is a material sacrifice', () => {
  const fen = 'r6k/8/8/8/8/8/8/N6K b - - 0 1';
  assert.equal(detectSacrifice(fen, 'a8a1'), true);
});

test('a sacrifice immediately recaptured by a bishop is not a material sacrifice', () => {
  const fen = 'r7/7k/8/8/8/2B5/8/N6K b - - 0 1';
  assert.equal(detectSacrifice(fen, 'a8a1'), false);
});

test('missing or non-capturing engine moves are not sacrifices', () => {
  assert.equal(detectSacrifice('r6k/8/8/8/8/8/8/N6K b - - 0 1', null), false);
  assert.equal(detectSacrifice('r6k/8/8/8/8/8/8/N6K b - - 0 1', 'h8g8'), false);
});
