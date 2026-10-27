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

test('the skill ladder strictly strengthens towards level 8', () => {
  for (let index = 1; index < ENGINE_LEVELS.length; index += 1) {
    assert.ok(
      ENGINE_LEVELS[index].depth > ENGINE_LEVELS[index - 1].depth,
      `level ${ENGINE_LEVELS[index].id} does not dig deeper than level ${ENGINE_LEVELS[index - 1].id}`,
    );
    assert.ok(
      ENGINE_LEVELS[index].chaos <= ENGINE_LEVELS[index - 1].chaos,
      `level ${ENGINE_LEVELS[index].id} is more random than level ${ENGINE_LEVELS[index - 1].id}`,
    );
    assert.ok(
      ENGINE_LEVELS[index].skill > ENGINE_LEVELS[index - 1].skill,
      `level ${ENGINE_LEVELS[index].id} does not place more skill than level ${ENGINE_LEVELS[index - 1].id}`,
    );
  }
  assert.equal(ENGINE_LEVELS[0].skill, 0);
  assert.equal(ENGINE_LEVELS[ENGINE_LEVELS.length - 1].skill, 20);
});

test('the resignment endpoint of chaos still plays real legal moves', () => {
  const seen = new Set<string>();
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = selectEngineMove(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1',
      getLevel(1),
      'e7e5',
      Math.random(), // let chaos fire naturally
    );
    assert.match(result.uci, /^[a-h][1-8][a-h][1-8](q|r|b|n)?$/);
    seen.add(result.uci);
  }
  assert.ok(seen.size > 1, 'chaotic play should vary between moves');
});

test('engine move selection returns a legal UCI move', () => {
  const result = selectEngineMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1', getLevel(5), 'e7e5');
  assert.deepEqual(result, { uci: 'e7e5', random: false });
});
