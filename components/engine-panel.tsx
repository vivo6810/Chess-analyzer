'use client';

import { Chess } from 'chess.js';
import { useEffect, useRef, useState } from 'react';

import { formatScore, toWhitePawns, useEngine, type EngineScore } from '@/lib/use-engine';

type Props = {
  fen: string;
  /** Depth to search to. Twelve is a good trade-off for an interactive panel. */
  depth?: number;
  autoStart?: boolean;
};

/**
 * The compact live engine HUD: one row of status, then the metric cells —
 * evaluation, best move and the principal variation. The bar is a thin live
 * strip inside the evaluation cell; the tall board-side strip is fed by the
 * review instead, so the two never fight over one worker.
 */
export default function EnginePanel({ fen, depth = 12, autoStart = false }: Props) {
  const { ready, error, analyse, stop } = useEngine();
  const [running, setRunning] = useState(autoStart);
  const [score, setScore] = useState<EngineScore | null>(null);
  const [thinking, setThinking] = useState(false);
  const fenRef = useRef(fen);
  fenRef.current = fen;

  const turn = (() => {
    try {
      return new Chess(fen).turn();
    } catch {
      return 'w' as const;
    }
  })();

  useEffect(() => {
    if (!running || !ready) return undefined;

    let cancelled = false;
    setThinking(true);

    analyse(fen, depth, (update) => {
      if (!cancelled) setScore(update);
    }).then((final) => {
      if (cancelled) return;
      setScore(final);
      setThinking(false);
    });

    return () => {
      cancelled = true;
      stop();
    };
  }, [fen, depth, running, ready, analyse, stop]);

  // Turning the panel off must actually release the engine, not just hide it.
  useEffect(() => {
    if (!running) {
      stop();
      setThinking(false);
    }
  }, [running, stop]);

  const pawns = score ? toWhitePawns(score, turn) : null;
  // Clamp to +/-5 pawns so a decisive position fills the bar without the
  // scale collapsing for normal positions.
  const whiteShare =
    pawns == null ? 0.5 : Math.max(0.03, Math.min(0.97, (pawns + 5) / 10));

  return (
    <section className="border-2 border-line bg-surface shadow-brut" aria-label="Live engine analysis">
      <header className="flex items-center justify-between gap-2 border-b-2 border-line px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="engine-status-dot" aria-hidden="true" />
          <h2 className="font-mono text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink">Stockfish 19</h2>
          <span className="whitespace-nowrap font-mono text-[10px] text-muted">
            depth {score?.depth ?? '—'}{thinking ? '…' : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setRunning((value) => !value)}
          disabled={!ready && !error}
          className="press shrink-0 border-2 border-line-strong px-2 py-0.5 font-mono text-[10px] font-bold text-ink transition-colors hover:bg-bone disabled:opacity-40"
        >
          {error ? 'Unavailable' : running ? 'Stop' : 'Analyse'}
        </button>
      </header>

      {error ? (
        <p className="px-4 py-3 text-[12px] text-muted">{error}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-px bg-line">
          <div className="bg-surface px-3 py-2.5">
            <dt className="text-[10px] font-bold tracking-[0.08em] text-muted uppercase">Evaluation</dt>
            <dd className="mt-1 font-mono text-[15px] font-extrabold text-accent tabular-nums">
              {score ? formatScore(score, turn) : ready ? '—' : 'boot…'}
            </dd>
            {/* Live thin strip: same fills as the board-side bar. */}
            <div className="mt-2 flex h-1 overflow-hidden" style={{ background: 'var(--color-eval-black)' }}>
              <div
                className="transition-[width] duration-200 ease-out"
                style={{ width: `${whiteShare * 100}%`, background: 'var(--color-eval-white)' }}
              />
            </div>
          </div>
          <div className="bg-surface px-3 py-2.5">
            <dt className="text-[10px] font-bold tracking-[0.08em] text-muted uppercase">Best move</dt>
            <dd className="mt-1 truncate font-mono text-[15px] font-extrabold text-ink">
              {score?.best ?? '—'}
            </dd>
            <p className="mt-2 font-mono text-[10px] text-muted">
              {thinking ? 'searching…' : running ? 'settled' : 'press Analyse'}
            </p>
          </div>
          {score?.pv?.length ? (
            <div className="col-span-2 bg-surface px-3 py-2">
              <dt className="text-[10px] font-bold tracking-[0.08em] text-muted uppercase">Principal variation</dt>
              <dd className="mt-1 truncate font-mono text-[11px] text-ink-soft">{score.pv.slice(0, 10).join(' ')}</dd>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  );
}
