import assert from 'node:assert/strict';
import test from 'node:test';

import { PgnError, parseOneGame, parsePgn, renderPgn, splitPgn } from './pgn.ts';

const TWO_GAMES = `[Event "One"]
[White "Alpha"]
[Black "Beta"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 1-0

[Event "Two"]
[White "Gamma"]
[Black "Delta"]
[Result "0-1"]

1. d4 d5 2. c4 c6 0-1`;

test('a blob with two games splits into two blocks', () => {
  const blocks = splitPgn(TWO_GAMES);
  assert.equal(blocks.length, 2);
  assert.match(blocks[1], /Gamma/);
  assert.match(blocks[0], /Alpha/);
});

test('a headerless game still parses as one game', () => {
  const blocks = splitPgn('\n1. e4 e5 2. Nf3 Nc6 1-0\n');
  assert.equal(blocks.length, 1);
  const parsed = parseOneGame(blocks[0]);
  assert.equal(parsed.white, 'Unknown');
  assert.equal(parsed.result, '1-0');
});

test('the moves replay legal and land in SAN with UCI and FEN', () => {
  const parsed = parseOneGame(TWO_GAMES.split('\n\n[')[0]);
  assert.deepEqual(
    parsed.moves.map((move) => move.san),
    ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
  );
  assert.ok(parsed.moves.every((move) => move.uci.length >= 4));
  /* Three white half-moves in: it is Black's turn in the final FEN. */
  assert.ok(parsed.moves[parsed.moves.length - 1].fen.includes(' b '));
});

test('headers are read, with sensible fallbacks', () => {
  const [first, second] = splitPgn(TWO_GAMES);
  const parsed = parseOneGame(second ?? '');
  assert.equal(parsed.white, 'Gamma');
  assert.equal(parsed.black, 'Delta');
  assert.equal(parsed.result, '0-1');
  assert.ok(first, 'the first block survived the split');
});

test('an illegal move fails with the move number', () => {
  assert.throws(
    () => parseOneGame('1. e4 e5 2. Ke3 1-0'),
    (error: unknown) => error instanceof PgnError && /Move 3/.test(error.message),
  );
});

test('an unfinished, unannotated game parses with a star result', () => {
  /* The analyzer is allowed to display a game that ran out of tags: '*' means
     "the record does not say", and the final position says the rest. */
  const open = parseOneGame('1. e4 e5');
  assert.equal(open.result, '*');

  /* Anonymous result column: the mate speaks for itself. */
  const mated = parseOneGame('1. f3 e5 2. g4 Qh4#');
  assert.equal(mated.result, '0-1');
  assert.equal(mated.termination, 'checkmate');
});

test('a game with no moves at all is refused', () => {
  assert.throws(
    () => parseOneGame('[Event "Nothing"]\n\n*'),
    (error: unknown) => error instanceof PgnError && /needs at least one move/.test(error.message),
  );
});

test('a stated contradiction is an error', () => {
  assert.throws(
    () => parseOneGame('[Result "1-0"]\n\n1. f3 e5 2. g4 Qh4#'),
    /contradicts/,
  );
});

test('an FEN start position is carried into the game', () => {
  const fen = '4k3/8/8/8/8/8/8/4K2R w K - 0 1';
  const parsed = parseOneGame(`[FEN "${fen}"]\n[Result "1-0"]\n\n1. Rh8+ 1-0`);
  assert.equal(parsed.startFen, fen);
  assert.equal(parsed.moves[0].san, 'Rh8+');
});

test('annotations, NAGs and variations do not confuse the parser', () => {
  const parsed = parseOneGame(
    '1. e4! {a fine move} e5 (1... d5 2. exd5 Qxd5) $1 2. Nf3?? $14 Nc6 1-0',
  );
  assert.deepEqual(
    parsed.moves.map((move) => move.san),
    ['e4', 'e5', 'Nf3', 'Nc6'],
  );
});

test('multi-game blobs refuse with the offending game indexed', () => {
  /* The third game carries a header, so the splitter can see it as its own
     block — a headerless tail merges into the previous block by design. */
  assert.throws(
    () => parsePgn(`${TWO_GAMES}\n\n[Event "Three"]\n[Result "1-0"]\n\n1. e4 Qh4?? 1-0`),
    (error: unknown) => error instanceof PgnError && /Game 3/.test(error.message),
  );
});

test('clock-bearing PGN exports round-trip SAN and remaining time', () => {
  const rendered = renderPgn(
    { Event: 'Test', White: 'Alpha', Black: 'Beta', Result: '1-0', TimeControl: '300+0' },
    [
      { san: 'e4', clk: 178 },
      { san: 'e5', clk: 180 },
      { san: 'Nf3', clk: 172 },
    ],
    '1-0',
  );
  const parsed = parseOneGame(rendered);
  assert.deepEqual(parsed.moves.map((move) => move.san), ['e4', 'e5', 'Nf3']);
  assert.deepEqual(parsed.moves.map((move) => move.clk), [178, 180, 172]);
  assert.match(rendered, /1\. e4 \{\[%clk 0:02:58\]\} e5 \{\[%clk 0:03:00\]\}/);
});

test('PGN export leaves out absent clock annotations', () => {
  const rendered = renderPgn({ White: 'A', Black: 'B' }, [{ san: 'e4' }, { san: 'e5' }], '*');
  assert.doesNotMatch(rendered, /%clk/);
  assert.match(rendered, /1\. e4 e5 \*$/);
});
