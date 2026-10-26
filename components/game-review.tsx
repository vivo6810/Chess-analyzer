'use client';

import { useMemo, useState } from 'react';

import { legalMoveCount } from '@/lib/game';
import {
  accuracyFromLoss,
  classifyMove,
  detectSacrifice,
  type MoveVerdict,
} from '@/lib/review';
import { useEngine } from '@/lib/use-engine';

export type ReviewMove = { san: string; uci: string; fen: string; clk?: number };
type Side = 'w' | 'b';
type PlyReview = {
  ply: number;
  san: string;
  mover: Side;
  loss: number;
  verdict: MoveVerdict;
  cpWhite: number;
};

export const VERDICT_STYLE: Record<MoveVerdict, string> = {
  forced: 'bg-bone text-muted',
  brilliant: 'bg-info-bg text-info-fg',
  best: 'bg-win-bg text-win-fg',
  excellent: 'bg-win-bg text-win-fg',
  good: 'bg-bone text-muted',
  inaccuracy: 'bg-draw-bg text-draw-fg',
  mistake: 'bg-loss-bg text-loss-fg',
  blunder: 'bg-loss-fg text-loss-bg',
};
const VERDICT_BAR_STYLE: Record<MoveVerdict, string> = {
  forced: 'bg-line-strong',
  brilliant: 'bg-move-brilliant',
  best: 'bg-move-best',
  excellent: 'bg-move-best',
  good: 'bg-move-critical',
  inaccuracy: 'bg-move-inaccuracy',
  mistake: 'bg-move-mistake',
  blunder: 'bg-move-blunder',
};

const TURN = (fen: string): Side => (fen.split(' ')[1] === 'w' ? 'w' : 'b');
const clampCp = (value: number) => Math.max(-500, Math.min(500, value));
const LABEL: Record<MoveVerdict, string> = { inaccuracy: 'inaccuracy', forced: 'forced', brilliant: 'brilliant', best: 'best', excellent: 'excellent', good: 'good', mistake: 'mistake', blunder: 'blunder' };

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
}: {
  initialFen: string;
  moves: ReviewMove[];
  whiteRating?: number | null;
  blackRating?: number | null;
  depth?: number;
  selectedPly?: number;
  onSelectPly?: (ply: number) => void;
  onReviewsChange?: (verdicts: MoveVerdict[]) => void;
}) {
  const { ready, error, analyse, stop } = useEngine();
  const [reviews, setReviews] = useState<PlyReview[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const [showMoves, setShowMoves] = useState(false);
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
        const before = collected[index];
        const after = collected[index + 1];
        const loss = Math.max(0, mover === 'w' ? before - after : after - before);
        return {
          ply: index + 1,
          san: move.san,
          mover,
          loss,
          verdict: classifyMove(loss, {
            onlyMove: legalMoveCount(positions[index]) === 1,
            matchesBestMove: bestMoves[index] === move.uci,
            sacrifice: detectSacrifice(positions[index + 1], bestMoves[index + 1]),
          }),
          cpWhite: after,
        };
      });
      setScores(collected);
      setReviews(output);
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
    const average = mine.reduce((sum, review) => sum + review.loss, 0) / mine.length;
    const accuracy = accuracyFromLoss(average, mine.length);
    return {
      accuracy,
      rating: side === 'w' ? whiteRating : blackRating,
      count: mine.length,
    };
  };
  const white = sideStats('w');
  const black = sideStats('b');
  const shownCp = scores[viewPly] ?? 0;
  const hasClocks = moves.some((move) => move.clk != null);
  const summaryVerdicts: MoveVerdict[] = ['brilliant', 'excellent', 'best', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced'];

  return (
    <section className="border-2 border-ink bg-surface shadow-brut" aria-label="Game analysis">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-5 py-3">
        <h2 className="text-[13px] font-bold text-ink">Full game review</h2>
        <button
          type="button"
          onClick={() => (running ? stop() : void run())}
          disabled={(!ready && !error) || moves.length === 0}
          className="press border-2 border-ink bg-accent px-3.5 py-2 text-[12px] font-bold text-on-accent shadow-brut-sm disabled:opacity-40"
        >
          {error ? 'Unavailable' : running ? `Stop · ${progress}%` : 'Review game'}
        </button>
      </header>
      {error || runError ? (
        <p role="alert" className="px-5 py-4 text-[13px] text-loss-fg">{error ?? runError}</p>
      ) : reviews.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-muted">
          {running
            ? `Position ${Math.round((progress / 100) * positions.length)} of ${positions.length} · depth ${depth}`
            : 'Run the review to label every move and rate both players.'}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] border-b-2 border-ink">
            <EvalBar cpWhite={shownCp} />
            <div className="grid grid-cols-2 divide-x-2 divide-line">
              {([['White', white], ['Black', black]] as const).map(([label, side]) => (
                <div key={label} className="px-4 py-3">
                  <p className="text-[10px] font-bold tracking-[0.08em] text-muted uppercase">{label} game rating</p>
                  <p className="mt-1 font-mono text-[22px] leading-none text-ink tabular-nums">{side?.rating ?? '—'}</p>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {side
                      ? `${side.accuracy.toFixed(1)}% accuracy · ${side.rating == null ? 'rating unavailable' : 'Chess.com rating'} · ${side.count} moves`
                      : 'no moves'}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <EvalGraph scores={scores} selected={viewPly} onSelect={seek} />
          <AnalyticsPanel reviews={reviews} moves={moves} hasClocks={hasClocks} />
          <section className="border-b-2 border-ink px-5 py-4" aria-label="Move verdict summary">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-ink">
                {summaryVerdicts.flatMap((verdict) => {
                  const count = reviews.filter((review) => review.verdict === verdict).length;
                  return count ? [<span key={verdict}>{LABEL[verdict]}: {count}</span>] : [];
                })}
              </p>
              <button
                type="button"
                aria-expanded={showMoves}
                onClick={() => setShowMoves((shown) => !shown)}
                className="border-b border-line-strong text-[11px] font-bold text-ink hover:text-accent"
              >
                {showMoves ? 'Show less' : 'Show more'}
              </button>
            </div>
            {showMoves ? (
              <ol className="mt-3 divide-y-2 divide-line border-t-2 border-line">
                <li>
                  <button type="button" onClick={() => seek(0)} className={`flex w-full items-center gap-3 px-2 py-2 text-left text-[12px] font-bold ${viewPly === 0 ? 'bg-bone' : 'hover:bg-bone'}`}>
                    <span className="font-mono text-muted">0</span>
                    <span className="text-ink">Starting position</span>
                    <span className="ml-auto font-mono text-muted tabular-nums">{formatCp(scores[0] ?? 0)}</span>
                  </button>
                </li>
                {reviews.map((review, index) => (
                  <li key={review.ply}>
                    <button type="button" onClick={() => seek(index + 1)} className={`grid w-full grid-cols-[2.5rem_3.5rem_1fr_auto_auto] items-center gap-3 px-2 py-2.5 text-left ${viewPly === review.ply ? 'bg-bone' : 'hover:bg-bone'}`}>
                      <span className="font-mono text-[11px] text-muted">{Math.ceil(review.ply / 2)}{review.mover === 'w' ? '.' : '…'}</span>
                      <span className="font-mono text-[13px] text-ink">{review.san}</span>
                      <span className="font-mono text-[12px] text-muted tabular-nums">{formatCp(review.cpWhite)}</span>
                      <span className="font-mono text-[11px] text-muted tabular-nums">{review.loss === 0 ? '—' : `−${(review.loss / 100).toFixed(2)}`}</span>
                      <span className={`badge ${VERDICT_STYLE[review.verdict]}`}>{LABEL[review.verdict]}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        </>
      )}
    </section>
  );
}

function formatCp(cp: number): string {
  if (Math.abs(cp) >= 9000) return cp > 0 ? 'mate' : '−mate';
  const pawns = cp / 100;
  return `${pawns > 0 ? '+' : pawns < 0 ? '' : ' '}${pawns.toFixed(2)}`;
}

function EvalBar({ cpWhite }: { cpWhite: number }) {
  const share = Math.max(0.02, Math.min(0.98, (clampCp(cpWhite) + 500) / 1000));
  return (
    <div className="flex h-full min-h-32 flex-col border-r-2 border-ink bg-solid" aria-label={`Evaluation ${formatCp(cpWhite)}`}>
      <div className="bg-canvas transition-[height] duration-300 ease-out" style={{ height: `${(1 - share) * 100}%` }} aria-hidden="true" />
      <div className="flex-1 bg-solid" aria-hidden="true" />
      <span className="sr-only">Evaluation {formatCp(cpWhite)}</span>
    </div>
  );
}

function EvalGraph({ scores, selected, onSelect }: { scores: number[]; selected: number; onSelect: (ply: number) => void }) {
  const width = Math.max(1, scores.length - 1);
  const points = scores.map((cp, index) => `${index},${50 - (clampCp(cp) / 10)}`).join(' ');
  return (
    <div className="border-b-2 border-ink px-5 py-4">
      <p className="text-[10px] font-bold tracking-[0.08em] text-muted uppercase">Evaluation · White advantage up / Black advantage down</p>
      <svg viewBox={`0 0 ${width} 100`} className="mt-2 h-16 w-full" preserveAspectRatio="none" role="img" aria-label="Evaluation graph">
        <line x1="0" y1="50" x2={width} y2="50" stroke="var(--color-line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points={points} fill="none" stroke="var(--color-ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <line x1={selected} y1="0" x2={selected} y2="100" stroke="var(--color-accent)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <input type="range" min={0} max={scores.length - 1} value={Math.min(selected, scores.length - 1)} onChange={(event) => onSelect(Number(event.target.value))} aria-label="Step through evaluation graph" className="mt-2 w-full accent-[var(--color-ink)]" />
    </div>
  );
}

function AnalyticsPanel({ reviews, moves, hasClocks }: { reviews: PlyReview[]; moves: ReviewMove[]; hasClocks: boolean }) {
  const verdicts: MoveVerdict[] = ['brilliant', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced'];
  const labels = LABEL;
  const clockLines = (side: Side) => moves.flatMap((move, index) => {
    if ((index % 2 === 0 ? 'w' : 'b') !== side || move.clk == null) return [];
    return [`${index},${100 - Math.min(100, move.clk / 60)}`];
  }).join(' ');
  const averageTime = (side: Side) => {
    const clocks = moves.flatMap((move, index) => (index % 2 === 0 ? 'w' : 'b') === side && move.clk != null ? [move.clk] : []);
    const spent = clocks.slice(1).map((clock, index) => Math.max(0, clocks[index] - clock));
    return spent.length ? Math.round(spent.reduce((sum, seconds) => sum + seconds, 0) / spent.length) : null;
  };
  const formatSeconds = (seconds: number | null) => seconds == null ? '—' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <section className="space-y-4 border-b-2 border-ink px-5 py-4" aria-label="Game analytics">
      <h3 className="text-[10px] font-bold tracking-[0.08em] text-muted uppercase">Analytics panel</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['w', 'b'] as const).map((side) => {
          const mine = reviews.filter((review) => review.mover === side);
          const total = Math.max(1, mine.length);
          return (
            <div key={side}>
              <p className="mb-2 text-[12px] font-bold text-ink">{side === 'w' ? 'White' : 'Black'} verdicts</p>
              <div className="flex h-3 overflow-hidden border border-line" role="img" aria-label={`${side === 'w' ? 'White' : 'Black'} verdict tally`}>
                {verdicts.map((verdict) => {
                  const count = mine.filter((review) => review.verdict === verdict).length;
                  return count ? <span key={verdict} className={VERDICT_BAR_STYLE[verdict]} style={{ width: `${count / total * 100}%` }} title={`${labels[verdict]}: ${count}`} /> : null;
                })}
              </div>
              <p className="mt-2 text-[12px] text-ink-soft">{verdicts.map((verdict) => {
                const count = mine.filter((review) => review.verdict === verdict).length;
                return count ? `${labels[verdict]} ${count}` : null;
              }).filter(Boolean).join(' · ')}</p>
            </div>
          );
        })}
      </div>
      <div>
        <p className="mb-2 text-[12px] font-bold text-ink">Clock remaining</p>
        {hasClocks ? (
          <>
            <div className="mb-1 flex gap-3 text-[11px] text-ink-soft">
              <span><span className="mr-1.5 inline-block h-2 w-2 bg-ink" aria-hidden="true" />White</span>
              <span><span className="mr-1.5 inline-block h-2 w-2 bg-accent" aria-hidden="true" />Black</span>
            </div>
            <svg viewBox={`0 0 ${Math.max(1, moves.length - 1)} 100`} className="h-16 w-full" preserveAspectRatio="none" role="img" aria-label="Clock remaining graph">
              <polyline points={clockLines('w')} fill="none" stroke="var(--color-ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <polyline points={clockLines('b')} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <p className="mt-1 text-[11px] text-muted">Approximate time per move · White {formatSeconds(averageTime('w'))} · Black {formatSeconds(averageTime('b'))}</p>
          </>
        ) : <p className="text-[11px] text-muted">This game has no clock record.</p>}
      </div>
    </section>
  );
}
