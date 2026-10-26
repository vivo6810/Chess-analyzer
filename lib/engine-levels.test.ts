import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LEVEL_ID, ENGINE_LEVELS, getLevel, selectEngineMove } from './engine-levels.ts';

test('engine levels are ordered and uniquely identified', () => {
  assert.deepEqual(ENGINE_LEVELS.map((level) => level.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(new Set(ENGINE_LEVELS.map((level) => level.id)).size, 8);
  assert.equal(getLevel(DEFAULT_LEVEL_ID).label, 'Level 3');
});

test('unknown engine levels throw', () => {
  assert.throws(() => getLevel(9), /Unknown engine level/);
});

test('engine move selection returns a legal UCI move', () => {
  const result = selectEngineMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1', getLevel(5), 'e7e5');
  assert.deepEqual(result, { uci: 'e7e5', random: false });
});
