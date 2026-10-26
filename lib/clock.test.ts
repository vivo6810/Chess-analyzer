import test from 'node:test';
import assert from 'node:assert/strict';

import { settleClock, type ClockFields } from './clock.ts';

const clock = (white_ms = 10_000, black_ms = 10_000, turn_started_at = 0): ClockFields => ({
  white_ms,
  black_ms,
  increment_ms: 0,
  per_move_ms: 0,
  turn_started_at,
});
const blitz = { mode: 'clock' as const, initialMs: 10_000, incrementMs: 1_000 };

test('Fischer increment is paid only to the mover', () => {
  const result = settleClock(clock(), 'w', 3_000, blitz);
  assert.equal(result.whiteMs, 8_000);
  assert.equal(result.blackMs, 10_000);
});

test('a flagging move receives no increment', () => {
  const result = settleClock(clock(1_000), 'w', 1_000, blitz);
  assert.equal(result.flagged, 'white');
  assert.equal(result.whiteMs, 0);
});

test('a move exactly at zero flags, while one millisecond inside passes', () => {
  assert.equal(settleClock(clock(1_000), 'w', 1_000, blitz).flagged, 'white');
  assert.equal(settleClock(clock(1_000), 'w', 999, blitz).flagged, null);
});

test('negative elapsed time is clamped to zero', () => {
  const result = settleClock(clock(10_000, 10_000, 100), 'w', 0, {
    mode: 'clock',
    initialMs: 10_000,
    incrementMs: 0,
  });
  assert.equal(result.elapsedMs, 0);
  assert.equal(result.whiteMs, 10_000);
});

test('correspondence refreshes the mover allowance every move', () => {
  const result = settleClock(clock(1), 'b', 86_399_000, {
    mode: 'per_move',
    initialMs: 86_400_000,
    incrementMs: 0,
  });
  assert.equal(result.flagged, null);
  assert.equal(result.blackMs, 86_400_000);
  assert.equal(result.whiteMs, 1);
});

test('a correspondence overrun flags the mover', () => {
  const result = settleClock(clock(), 'b', 86_400_001, {
    mode: 'per_move',
    initialMs: 86_400_000,
    incrementMs: 0,
  });
  assert.equal(result.flagged, 'black');
  assert.equal(result.blackMs, 0);
});

test('an untimed game never flags regardless of elapsed time', () => {
  const result = settleClock(clock(0, 0), 'w', 99_000_000_000, {
    mode: 'none',
    initialMs: 0,
    incrementMs: 0,
  });
  assert.equal(result.flagged, null);
  assert.equal(result.whiteMs, 0);
});
