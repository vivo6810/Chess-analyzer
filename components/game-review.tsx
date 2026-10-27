'use client';

import { useMemo, useState } from 'react';

import { openingForMoves } from '@/lib/openings';
import {
  accuracyFromLosses,
  classifyMove,
  detectSacrifice,
  expectedPoints,
  isBookMove,
  type MoveVerdict,
} from '@/lib/review';
import { VERDICT_COLOR, VerdictGlyph } from '@/components/verdict-badge';
import { useEngine } from '@/lib/use-engine';

export type ReviewMove = { san: string; uci: string; fen: string; clk?: number };
type Side = 'w' | 'b';
type PlyReview = {
  ply: number;
  san: string;
  mover: Side;
  loss: number;
  /** Expected points this move spent against the position's best line. */
  epLoss: number;
  verdict: MoveVerdict;
  cpWhite: number;
};

const VERDICT_BAR_STYLE: Record<MoveVerdict, string> = {
  brilliant: 'bg-move-brilliant',
  great: 'bg-move-critical',
  best: 'bg-move-best',
  excellent: 'bg-move-excellent',
  book: 'bg-move-book',
  good: 'bg-move-good',
  inaccuracy: 'bg-move-inaccuracy',
  mistake: 'bg-move-mistake',
  miss: 'bg-move-miss',
  blunder: 'bg-move-blunder',
};

/*
 * The graded verdicts, in the order the matrix lists them. Forced stays out —
 * it grades the absence of an alternative, not the move.
 */
/* The graded verdicts, in the order the matrix lists them — chess.com's
   presentation order. Forced stays out: it grades the absence of an
   alternative, not the move. */
const MATRIX_VERDICTS: MoveVerdict[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'book',
  'good',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];
const LABEL: Record<MoveVerdict, string> = {
  brilliant: 'brilliant',
  great: 'great',
  book: 'book',
  best: 'best',
  excellent: 'excellent',
  good: 'good',
  inaccuracy: 'inaccuracy',
  mistake: 'mistake',
  miss: 'miss',
  blunder: 'blunder',
};

const TURN = (fen: string): Side => (fen.split(' ')[1] === 'w' ? 'w' : 'b');
const clampCp = (value: number) => Math.max(-500, Math.min(500, value));

const toWhiteCp = (cp: number | null, mate: number | null, turn: Side): number => {
  if (mate != null) {
    const forWhite = turn === 'w' ? mate : -mate;
    return forWhite > 0 ? 10_000 : -10_000;
  }
  return turn === 'w' ? cp ?? 0 : -(cp ?? 0);
};

export default function GameReview({
  initialFen,
  moves,
  whiteRating,
  blackRating,
  depth = 12,
  selectedPly,
  onSelectPly,
  onReviewsChange,
  onScoresChange,
}: {
  initialFen: string;
  moves: ReviewMove[];
  whiteRating?: number | null;
  blackRating?: number | null;
  depth?: number;
  selectedPly?: number;
  onSelectPly?: (ply: number) => void;
  onReviewsChange?: (verdicts: MoveVerdict[]) => void;
  /** Per-position White-relative evaluation, for the board's vertical bar. */
  onScoresChange?: (scores: number[]) => void;
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reviews, setReviews] = useState<PlyReview[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const { ready, error, analyse, stop } = useEngine();
  const controlled = selectedPly != null && onSelectPly != null;
  const viewPly = controlled ? selectedPly : selected;
  const seek = (ply: number) => {
    if (controlled) onSelectPly(ply);
    else setSelected(ply);
  };

  const positions = useMemo(() => [initialFen, ...moves.map((move) => move.fen)], [initialFen, moves]);

  const run = async () => {
    if (positions.length < 2 || running || !ready) return;
    setRunning(true);
    setRunError(null);
    setReviews([]);
    onReviewsChange?.([]);
    setScores([]);
    onScoresChange?.([]);
    setProgress(0);
    if (!controlled) setSelected(0);
    try {
      const collected: number[] = [];
      const bestMoves: (string | null)[] = [];
      for (let index = 0; index < positions.length; index += 1) {
        const fen = positions[index];
        const result = await analyse(fen, depth);
        collected.push(toWhiteCp(result.cp, result.mate, TURN(fen)));
        bestMoves.push(result.best);
        setProgress(Math.round(((index + 1) / positions.length) * 100));
      }
      const output = moves.map((move, index): PlyReview => {
        const mover = TURN(positions[index]);
        /* The expected-points model wants the evaluation from the mover's own
           seat, weighted by the mover's rating — the same eval is worth more
           to a 2300 than to a 700. Ratings arrive per player from the game. */
        const moverCp = (cp: number) => (mover === 'w' ? cp : -cp);
        const moverRating = mover === 'w' ? whiteRating : blackRating;
        const before = expectedPoints(moverCp(collected[index]), moverRating);
        const after = expectedPoints(moverCp(collected[index + 1]), moverRating);
        const whiteBefore = mover === 'w' ? collected[index] : -collected[index];
        const whiteAfter = collected[index + 1];
        const loss = Math.max(0, whiteBefore - whiteAfter); // centipawns, for the loss column
        return {
          ply: index + 1,
          san: move.san,
          mover,
          loss,
          epLoss: Math.max(0, Math.min(1, before - after)),
          verdict: classifyMove(before, after, {
            matchesBestMove: bestMoves[index] === move.uci,
            sacrifice: detectSacrifice(positions[index + 1], bestMoves[index + 1]),
            book: isBookMove(moves.slice(0, index + 1).map((entry) => entry.san)),
          }),
          cpWhite: whiteAfter,
        };
      });
      setScores(collected);
      setReviews(output);
      onScoresChange?.(collected);
      onReviewsChange?.(output.map((review) => review.verdict));
    } catch (caught) {
      setRunError(caught instanceof Error ? caught.message : 'The review could not be completed.');
    } finally {
      setRunning(false);
    }
  };

  const sideStats = (side: Side) => {
    const mine = reviews.filter((review) => review.mover === side);
    if (!mine.length) return null;
    const accuracy = accuracyFromLosses(mine.map((review) => review.epLoss));
    return {
      accuracy,
      rating: side === 'w' ? whiteRating : blackRating,
      count: mine.length,
    };
  };
  const white = sideStats('w');
  const black = sideStats('b');
  const hasClocks = moves.some((move) => move.clk != null);

  const cardHead = (title: string, sub?: string) => (
    <header className="flex items-center justify-between gap-2 border-b-2 border-line px-4 py-2.5">
      <h2 className="font-mono text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink">{title}</h2>
      {sub ? <span className="font-mono text-[10px] text-muted uppercase">{sub}</span> : null}
    </header>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4" aria-label="Game analysis">
      {/* ── A. Full game review ─────────────────────────────────── */}
      <section className="border-2 border-line bg-surface shadow-brut">
        {cardHead('Full game review', running ? `${progress}%` : depth ? `depth ${depth}` : undefined)}
        <div className="border-b border-line px-4 pt-3">
          <button
            type="button"
            onClick={() => (running ? stop() : void run())}
            disabled={(!ready && !error) || moves.length === 0}
            className="press mb-3 min-h-10 w-full border-2 border-ink bg-accent px-3.5 text-[12px] font-bold text-on-accent shadow-brut-sm disabled:opacity-40"
          >
            {error ? 'Engine unavailable' : running ? `Stop · ${progress}%` : 'Review game'}
          </button>
          {error || runError ? (
            <p role="alert" className="pb-3 text-[12px] text-loss-fg">{error ?? runError}</p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-px bg-line">
          {([['White', white, 'var(--color-eval-white)'], ['Black', black, 'var(--color-line-strong)']] as const).map(
            ([label, side, edge]) => (
              <div key={label} className="bg-surface px-4 py-3" style={{ borderLeft: `4px solid ${edge}` }}>
                <p className="text-[10px] font-bold tracking-[0.08em] text-muted uppercase">{label} game rating</p>
                <p className="mt-1 font-mono text-[26px] leading-none text-ink tabular-nums">{side?.rating ?? '—'}</p>
                <p className="mt-2 text-[11px] text-accent">
                  {side ? `${side.accuracy.toFixed(1)}% accuracy` : 'not reviewed yet'}
                </p>
                {side ? <p className="mt-0.5 text-[10px] text-muted">{side.count} moves reviewed</p> : null}
              </div>
            ),
          )}
        </div>
      </section>

      {/* ── B. Evaluation advantage ─────────────────────────────── */}
      <section className="border-2 border-line bg-surface shadow-brut">
        {cardHead('Evaluation advantage', 'white up / black down')}
        {reviews.length ? (
          <EvalGraph scores={scores} selected={viewPly} onSelect={seek} />
        ) : (
          <p className="px-4 py-4 text-[12px] text-muted">
            {running ? `Reviewing position ${Math.round((progress / 100) * positions.length)} of ${positions.length}…` : 'Run the review to draw the evaluation curve.'}
          </p>
        )}
      </section>

      {/* ── C. Move verdicts ────────────────────────────────────── */}
      <section className="border-2 border-line bg-surface shadow-brut">
        {cardHead('Move verdicts', 'white · black')}
        {reviews.length ? (
          <div className="grid grid-cols-2 gap-4 px-4 py-3">
            {(['w', 'b'] as const).map((side) => {
              const mine = reviews.filter((review) => review.mover === side);
              const total = Math.max(1, mine.length);
              return (
                <div key={side}>
                  <p className="mb-1.5 font-mono text-[10px] font-bold uppercase text-muted">{side === 'w' ? 'White' : 'Black'} tally</p>
                  <div className="flex h-2.5 overflow-hidden border border-line" role="img" aria-label={`${side === 'w' ? 'White' : 'Black'} verdict tally`}>
                    {MATRIX_VERDICTS.map((verdict) => {
                      const count = mine.filter((review) => review.verdict === verdict).length;
                      return count ? <span key={verdict} className={VERDICT_BAR_STYLE[verdict]} style={{ width: `${(count / total) * 100}%` }} title={`${LABEL[verdict]}: ${count}`} /> : null;
                    })}
                  </div>
                </div>
              );
            })}
            {/* Aligned matrix: White count, verdict, Black count — scannable
                down the middle instead of a wrapped sentence. */}
            <dl className="col-span-2 border-t-2 border-line pt-1">
              {MATRIX_VERDICTS.map((verdict) => {
                const wCount = reviews.filter((review) => review.mover === 'w' && review.verdict === verdict).length;
                const bCount = reviews.filter((review) => review.mover === 'b' && review.verdict === verdict).length;
                return (
                  <div key={verdict} className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center border-b border-line last:border-0">
                    <dd className="py-1.5 text-left font-mono text-[12px] font-bold text-ink tabular-nums">{wCount}</dd>
                    <dt
                      className="flex items-center justify-center gap-1.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.04em]"
                      style={{ color: VERDICT_COLOR[verdict] }}
                    >
                      <VerdictGlyph verdict={verdict} className="h-3 w-3" />
                      {LABEL[verdict]}
                    </dt>
                    <dd className="py-1.5 text-right font-mono text-[12px] font-bold text-ink tabular-nums">{bCount}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ) : (
          <p className="px-4 py-4 text-[12px] text-muted">
            {running ? 'Counting verdicts as the review runs…' : 'Run the review to tally every move.'}
          </p>
        )}
      </section>

      {/* ── D. Clocks ───────────────────────────────────────────── */}
      <section className="border-2 border-line bg-surface shadow-brut">
        {cardHead('Clocks', hasClocks ? 'remaining · time per move' : undefined)}
        {hasClocks ? <ClockPanel moves={moves} /> : (
          <p className="px-4 py-4 text-[12px] text-muted">This game carries no clock record.</p>
        )}
      </section>
    </div>
  );
}

function EvalGraph({ scores, selected, onSelect }: { scores: number[]; selected: number; onSelect: (ply: number) => void }) {
  const width = Math.max(1, scores.length - 1);
  const points = scores.map((cp, index) => `${index},${50 - (clampCp(cp) / 10)}`).join(' ');
  return (
    <div className="px-4 pb-4">
      <svg viewBox={`0 0 ${width} 100`} className="h-16 w-full" preserveAspectRatio="none" role="img" aria-label="Evaluation graph">
        <line x1="0" y1="50" x2={width} y2="50" stroke="var(--color-line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points={points} fill="none" stroke="var(--color-ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <line x1={selected} y1="0" x2={selected} y2="100" stroke="var(--color-accent)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <input
        type="range"
        min={0}
        max={scores.length - 1}
        value={Math.min(selected, scores.length - 1)}
        onChange={(event) => onSelect(Number(event.target.value))}
        aria-label="Step through evaluation graph"
        className="mt-2 w-full accent-[var(--color-ink)]"
      />
    </div>
  );
}

function ClockPanel({ moves }: { moves: ReviewMove[] }) {
  const side = (side: Side) => moves.flatMap((move, index) => {
    if ((index % 2 === 0 ? 'w' : 'b') !== side || move.clk == null) return [];
    return [`${index},${100 - Math.min(100, move.clk / 60)}`];
  }).join(' ');
  const averageTime = (side: Side) => {
    const clocks = moves.flatMap((move, index) => ((index % 2 === 0 ? 'w' : 'b') === side && move.clk != null ? [move.clk] : []));
    const spent = clocks.slice(1).map((clock, index) => Math.max(0, clocks[index] - clock));
    return spent.length ? Math.round(spent.reduce((sum, seconds) => sum + seconds, 0) / spent.length) : null;
  };
  const formatSeconds = (seconds: number | null) => (seconds == null ? '—' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);

  return (
    <div className="px-4 pb-4">
      <div className="mb-1 flex gap-3 text-[11px] text-ink-soft">
        <span><span className="mr-1.5 inline-block h-2 w-2 bg-ink" aria-hidden="true" />White</span>
        <span><span className="mr-1.5 inline-block h-2 w-2 bg-accent-2" aria-hidden="true" />Black</span>
      </div>
      <svg viewBox={`0 0 ${Math.max(1, moves.length - 1)} 100`} className="h-16 w-full" preserveAspectRatio="none" role="img" aria-label="Clock remaining graph">
        <polyline points={side('w')} fill="none" stroke="var(--color-ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polyline points={side('b')} fill="none" stroke="var(--color-accent-2)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-1 text-[11px] text-muted">Average time per move · White {formatSeconds(averageTime('w'))} · Black {formatSeconds(averageTime('b'))}</p>
    </div>
  );
}
