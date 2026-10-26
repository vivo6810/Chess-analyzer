import test from 'node:test';
import assert from 'node:assert/strict';

import { analysisId, canStorePgn, capNewest, upsertNewest } from './local-user.ts';

test('cookie data helpers cap entries newest-first and deduplicate ids', () => {
  const entries = [{ id: 'a', ts: 1 }, { id: 'b', ts: 2 }];
  assert.deepEqual(upsertNewest(entries, { id: 'a', ts: 3 }, 2), [
    { id: 'a', ts: 3 },
    { id: 'b', ts: 2 },
  ]);
  assert.deepEqual(capNewest(entries, 1), [{ id: 'b', ts: 2 }]);
});

test('analysis ids are stable', () => {
  assert.equal(analysisId('White|Black|1-0|e2e4'), analysisId('White|Black|1-0|e2e4'));
  assert.notEqual(analysisId('White|Black|1-0|e2e4'), analysisId('White|Black|0-1|e2e4'));
});

test('PGN cookie storage obeys the safe per-cookie budget', () => {
  assert.equal(canStorePgn('x'.repeat(3200)), true);
  assert.equal(canStorePgn('x'.repeat(3201)), false);
  assert.equal(canStorePgn('\uD800'), false);
});
