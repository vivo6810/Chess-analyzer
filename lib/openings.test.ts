import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyOpening, openingForMoves } from './openings.ts';

test('an empty or foreign move list labels nothing', () => {
  assert.equal(openingForMoves([]), null);
  assert.equal(openingForMoves(['a3']), null);
});

test('the Italian game is recognised', () => {
  const found = classifyOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
  assert.ok(found, 'the line matched');
  assert.equal(found!.opening.eco, 'C50');
  assert.equal(found!.opening.name, 'Italian Game');
});

test('a specific line wins over its family', () => {
  const najdorf = classifyOpening([
    'e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6',
  ]);
  assert.equal(najdorf!.opening.eco, 'B90');
  assert.ok(najdorf!.opening.name.includes('Najdorf'));

  /* Two plies short, it is still the Sicilian — but the family one. */
  const sicilian = classifyOpening(['e4', 'c5', 'Nf3', 'd6', 'd4']);
  assert.equal(sicilian!.opening.eco, 'B50');
});

test('a far move list truncates the match, not the identity', () => {
  /* A Najdorf that then wanders off still labels from what was matched. */
  const found = openingForMoves([
    'e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6',
    'Be2', 'e5',
  ]);
  assert.equal(found, 'B90 Sicilian: Najdorf');
});

test('the queen\'s gambit family lines resolve distinctly', () => {
  assert.match(openingForMoves(['d4', 'd5', 'c4', 'e6'])!, /QGD|Declined/);
  assert.match(openingForMoves(['d4', 'd5', 'c4', 'c6'])!, /Slav/);
  assert.match(openingForMoves(['d4', 'd5', 'c4', 'dxc4'])!, /Accepted/);
});

test('the first move alone carries the ECO label', () => {
  assert.equal(openingForMoves(['c4']), 'A10 English Opening');
  assert.equal(openingForMoves(['f4']), "A02 Bird's Opening");
});

test('a wrong order does not match', () => {
  /* The Italian needs Bc4 after the knight develops; the reverse is nothing. */
  assert.equal(openingForMoves(['e4', 'e5', 'Bc4', 'Nc3', 'Nf3']), 'C23 Bishop\'s Opening');
});
