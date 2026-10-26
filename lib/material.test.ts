import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';

import { capturedPieces, materialAdvantage } from './material.ts';

test('captured pieces and material lead follow the current replay position', () => {
  const game = new Chess();
  game.move('e4');
  game.move('d5');
  game.move('exd5');

  const captured = capturedPieces(new Chess().fen(), game.fen());
  assert.deepEqual(captured.whiteHas, ['bP']);
  assert.deepEqual(captured.blackHas, []);
  assert.equal(materialAdvantage(captured, 'w'), 1);
  assert.equal(materialAdvantage(captured, 'b'), -1);
});

test('invalid positions do not invent captured material', () => {
  const captured = capturedPieces('invalid', 'invalid');
  assert.deepEqual(captured, { whiteHas: [], blackHas: [] });
  assert.equal(materialAdvantage(captured, 'w'), 0);
});
