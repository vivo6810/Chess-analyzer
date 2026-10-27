'use client';

import { Chess } from 'chess.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Chessboard, defaultPieces } from 'react-chessboard';

import EnginePanel from '@/components/engine-panel';
import GameReview from '@/components/game-review';
import { VERDICT_COLOR } from '@/components/verdict-badge';
import PlayerBoardRow from '@/components/player-board-row';
import { kingSquare, targetsFrom, type MoveTarget, type Side } from '@/lib/chess-ui';
import { capturedPieces, materialAdvantage } from '@/lib/material';
import type { ReviewMove } from '@/components/game-review';
import type { MoveVerdict } from '@/lib/review';

/**
 * The completed game's board — the analysis workstation.
 *
 * A finished game cannot be changed and should not look like it can: the main
 * position is stepped through, not played. The one way this board moves on its
 * own is the exploration branch — clear off the recorded game, labelled
 * "You are exploring", and reading only until the player presses back to the
 * record. Nothing underneath it is written to.
 *
 * Layout: a fixed-ish three-column studio. Column one is the board stage
 * (vertical evaluation, players, transport, utilities); column two is live
 * stepping (compact engine HUD + a two-per-row move table); column three is
 * the post-game analytics the review produces. The site header above and the
 * page titles around it stay owned by the pages.
 */

export type ReplayProps = {
  gameId: string;
  startFen: string;
  moves: ReviewMove[];
  result: string | null;
  pgn: string | null;
  white: string;
  black: string;
  whiteRating?: number | null;
  blackRating?: number | null;
  timeControl?: string | null;
  whiteClock?: number[];
  blackClock?: number[];
};

const DOT: CSSProperties = {
  backgroundImage:
    'radial-gradient(circle at 50% 50%, var(--color-accent) 0 15%, transparent 16%)',
};
const RING: CSSProperties = {
  backgroundImage:
    'radial-gradient(circle at 50% 50%, transparent 0 39%, var(--color-accent) 40% 48%, transparent 49%)',
};

const turnOf = (fen: string): Side => (fen.split(' ')[1] === 'w' ? 'w' : 'b');

function inCheck(fen: string): boolean {
  try {
    return new Chess(fen).isCheck();
  } catch {
    return false;
  }
}

type Branch = { fens: string[]; index: number };

/* Evaluation helpers, shared with the review's per-position scores. Both are
   clamped to ±5 pawns so a decisive position fills the strip without the
   scale collapsing for normal positions. */
const clampCp = (value: number) => Math.max(-500, Math.min(500, value));
const formatEval = (cp: number) => {
  const pawns = cp / 100;
  return `${pawns > 0 ? '+' : pawns < 0 ? '' : ' '}${pawns.toFixed(2)}`;
};
const formatClock = (clk: number) =>
  `${Math.floor(clk / 60)}:${String(Math.round(clk % 60)).padStart(2, '0')}`;

/* Short verdict tags for the move table, colored by the verdict tokens. */
const TAG_LABEL: Partial<Record<MoveVerdict, string>> = {
  brilliant: 'BRIL',
  best: 'BEST',
  excellent: 'EXC',
  good: 'GOOD',
  inaccuracy: 'INACC',
  mistake: 'MIST',
  blunder: 'BLUND',
  forced: '· forced ·',
};

const MOVE_FILTERS: { id: 'all' | 'brilliant' | 'best' | 'inaccuracy' | 'blunder'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'brilliant', label: 'Brill' },
  { id: 'best', label: 'Best' },
  { id: 'inaccuracy', label: 'Inacc' },
  { id: 'blunder', label: 'Blunder' },
];

export default function GameReplay({
  gameId,
  startFen,
  moves,
  result,
  pgn,
  white,
  black,
  whiteRating,
  blackRating,
  timeControl,
}: ReplayProps) {
  const [ply, setPly] = useState(0); // 0 = starting position
  const [flip, setFlip] = useState(false);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [moveVerdicts, setMoveVerdicts] = useState<MoveVerdict[]>([]);
  const [reviewScores, setReviewScores] = useState<number[]>([]);
  const [moveFilter, setMoveFilter] = useState<(typeof MOVE_FILTERS)[number]['id']>('all');
  const activeCellRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!pgn) {
      setExportUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }));
    setExportUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pgn]);

  const gameFen = ply === 0 ? startFen : moves[ply - 1].fen;
  const fen = branch ? branch.fens[branch.index] : gameFen;
  const turn = turnOf(fen);

  const seek = useCallback(
    (target: number) => {
      setBranch(null);
      setSelected(null);
      setPly(Math.max(0, Math.min(moves.length, target)));
    },
    [moves.length],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seek(ply - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        seek(ply + 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        seek(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        seek(moves.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moves.length, ply, seek]);

  /* ── Exploration ────────────────────────────────────────────────── */
  const exploring = branch != null;

  const targets: MoveTarget[] = useMemo(
    () => (exploring && selected ? targetsFrom(fen, selected) : []),
    [exploring, selected, fen],
  );

  const applyExplore = useCallback(
    (from: string, to: string, promotion?: string) => {
      const probe = new Chess(fen);
      try {
        probe.move({ from, to, promotion: promotion ?? 'q' });
      } catch {
        return;
      }
      setSelected(null);
      setBranch((current) => {
        const base = current ? current.fens.slice(0, current.index + 1) : [fen];
        return { fens: [...base, probe.fen()], index: base.length };
      });
    },
    [fen],
  );

  const stepBranch = useCallback(
    (delta: number) => {
      setBranch((current) =>
        current
          ? { ...current, index: Math.max(0, Math.min(current.fens.length - 1, current.index + delta)) }
          : current,
      );
      setSelected(null);
    },
    [],
  );

  const onSquareClick = useCallback(
    ({ square }: { square: string }) => {
      if (!exploring) return;

      const target = targets.find((entry) => entry.to === square);
      if (selected && target) {
        if (target.promotion) {
          setPendingPromotion({ from: selected, to: square });
          return;
        }
        applyExplore(selected, square);
        return;
      }

      const owns = (() => {
        try {
          const piece = new Chess(fen).get(square as never);
          return piece?.color === turn;
        } catch {
          return false;
        }
      })();
      if (owns) setSelected(selected === square ? null : square);
      else setSelected(null);
    },
    [applyExplore, exploring, fen, selected, targets, turn],
  );

  const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
      if (!exploring || !targetSquare || targetSquare === sourceSquare) return false;
      const promoting = targetsFrom(fen, sourceSquare).some(
        (target) => target.to === targetSquare && target.promotion,
      );
      if (promoting) {
        setPendingPromotion({ from: sourceSquare, to: targetSquare });
        return false;
      }
      applyExplore(sourceSquare, targetSquare);
      return true;
    },
    [applyExplore, exploring, fen],
  );

  const copyFen = async () => {
    try {
      await navigator.clipboard.writeText(fen);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  /* ── Marks ──────────────────────────────────────────────────────── */
  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    const paint = (square: string, style: CSSProperties) => {
      styles[square] = { ...(styles[square] ?? {}), ...style };
    };

    if (!exploring) {
      const last = ply > 0 ? moves[ply - 1] : null;
      if (last?.uci && last.uci.length >= 4) {
        for (const square of [last.uci.slice(0, 2), last.uci.slice(2, 4)]) {
          /* The palette brief asks for a translucent gold wash on the squares
             the last move touched, not just a ring — visible on both slate
             surface tones. It mixes at use time so the token stays plain hex. */
          paint(square, {
            backgroundColor: 'color-mix(in srgb, var(--color-last-move) 40%, transparent)',
          });
        }
        /* The engine's verdict for the move on the board: the arrival square
           wears the verdict colour, so the classification is on the position
           itself, not only in the move list. Forced is skipped — it grades
           the absence of an alternative, not the move. Brilliant pulses an
           emissive ring and blunder shakes the square; everything else stays
           quiet. Reduced-motion strips the animations (globals.css) and the
           static ring remains. */
        const verdict = moveVerdicts[ply - 1];
        if (verdict && verdict !== 'forced') {
          const ring = `inset 0 0 0 4px color-mix(in srgb, ${VERDICT_COLOR[verdict]} 70%, transparent)`;
          paint(
            last.uci.slice(2, 4),
            verdict === 'brilliant'
              ? { boxShadow: ring, animation: 'arb-verdict-brilliant 1s ease-out both' }
              : verdict === 'blunder'
                ? { boxShadow: ring, animation: 'arb-verdict-blunder 380ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both' }
                : { boxShadow: ring },
          );
        }
      }
    }

    if (inCheck(fen)) {
      const king = kingSquare(fen, turn);
      if (king) paint(king, { boxShadow: 'inset 0 0 0 4px var(--color-loss-fg)' });
    }

    if (selected) paint(selected, { boxShadow: 'inset 0 0 0 4px var(--color-accent)' });
    for (const target of targets) paint(target.to, target.capture ? RING : DOT);

    return styles;
  }, [exploring, fen, moveVerdicts, moves, ply, selected, targets, turn]);

  const captured = useMemo(() => capturedPieces(startFen, fen), [startFen, fen]);
  const initialClockMs = useMemo(() => {
    const match = /^(\d+)(?:\/(\d+)|\+\d+)?$/.exec(timeControl ?? '');
    if (!match) return null;
    return Number(match[2] ?? match[1]) * 1000;
  }, [timeControl]);
  const recordedClock = (side: Side): number | null => {
    const lastMove = moves.slice(0, ply).reverse().find((move) => {
      const mover = move.fen.split(' ')[1] === 'w' ? 'b' : 'w';
      return mover === side && move.clk != null;
    });
    return lastMove?.clk != null ? lastMove.clk * 1000 : initialClockMs;
  };
  const topSide: Side = flip ? 'w' : 'b';
  const bottomSide: Side = topSide === 'w' ? 'b' : 'w';
  const materialFor = (side: Side) => materialAdvantage(captured, side);
  const piecesFor = (side: Side) => side === 'w' ? captured.whiteHas : captured.blackHas;
  const displayName = (side: Side) => side === 'w' ? white : black;
  const displayRating = (side: Side) => side === 'w' ? whiteRating : blackRating;

  /* The board-side vertical evaluation strip: fed by the review's
     per-position scores (White-relative), so stepping a move updates it the
     moment the review has run — no second engine behind the bar. */
  const shownCp = reviewScores[ply] ?? null;
  const evalShare = shownCp == null ? 0.5 : (clampCp(shownCp) + 500) / 1000;

  /* The active table cell follows the board, not the reader's hand. */
  const currentPly = exploring ? -1 : ply;
  useEffect(() => {
    if (currentPly > 0) activeCellRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentPly, moveVerdicts.length, moves.length]);

  const buttonClass =
    'press flex min-h-9 shrink-0 items-center border-2 border-line-strong bg-surface px-2.5 py-1 font-mono text-[11px] font-bold text-ink hover:bg-bone disabled:opacity-40 disabled:hover:bg-surface';

  /* Per-move filter counts for the chips, over graded verdicts only. */
  const filterCounts = useMemo(() => {
    const counts = new Map<(typeof MOVE_FILTERS)[number]['id'], number>();
    for (const filter of MOVE_FILTERS) {
      counts.set(
        filter.id,
        filter.id === 'all'
          ? moves.length
          : moveVerdicts.filter((verdict, index) => verdict === filter.id && index < moves.length).length,
      );
    }
    return counts;
  }, [moveVerdicts, moves.length]);

  return (
    <div
      aria-label={`Game ${gameId} replay`}
      className="mx-auto grid min-w-0 max-w-[1480px] items-start gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(19rem,0.75fr)_minmax(19.5rem,0.9fr)]"
    >
      {/* ══ COLUMN 1 · board stage ══════════════════════════════════ */}
      <section className="min-w-0">
        {exploring ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 border-2 border-info-fg bg-info-bg px-3 py-2">
            <span className="badge bg-info-bg text-info-fg border-0">Exploring</span>
            <p className="flex-1 text-[12px] font-medium text-info-fg">
              These moves are not part of the game — the record underneath is untouched.
            </p>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => stepBranch(-1)} disabled={branch.index === 0} className={buttonClass}>
                ‹ Back
              </button>
              <button
                type="button"
                onClick={() => stepBranch(1)}
                disabled={branch.index >= branch.fens.length - 1}
                className={buttonClass}
              >
                Forward ›
              </button>
              <button type="button" onClick={() => seek(ply)} className="press min-h-9 border-2 border-info-fg bg-surface px-2.5 py-1 font-mono text-[11px] font-bold text-info-fg">
                Return to the game
              </button>
            </div>
          </div>
        ) : null}

        {/* Evaluation strip runs the full height of the board stack, so the
            score curve is visible while stepping without hunting for the
            engine card. */}
        <div className="flex items-stretch gap-2.5">
          <div
            aria-label={
              shownCp == null
                ? 'Evaluation — run the review for per-move scores'
                : `Evaluation ${formatEval(shownCp)}, White advantage up`
            }
            className="flex w-7 shrink-0 flex-col overflow-hidden border-2 border-line-strong bg-canvas"
          >
            <div
              className="transition-[height] duration-300 ease-out"
              style={{ height: `${(1 - evalShare) * 100}%`, background: 'var(--color-eval-black)' }}
            />
            <div className="relative min-h-6 flex-1" style={{ background: 'var(--color-eval-white)' }}>
              <span className="absolute inset-x-0 bottom-0.5 text-center font-mono text-[9px] leading-none">
                <span className="bg-canvas px-1 py-0.5 font-bold text-ink">
                  {shownCp == null ? '—' : formatEval(shownCp)}
                </span>
              </span>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <PlayerBoardRow
              side={topSide}
              name={displayName(topSide)}
              rating={displayRating(topSide)}
              captures={piecesFor(topSide)}
              material={materialFor(topSide)}
              clock={recordedClock(topSide)}
              active={!exploring && turn === topSide}
            />
            <div className="board-shell relative mx-auto aspect-square w-full max-w-[min(100%,66dvh)] overflow-hidden border-2 border-line select-none">
              <Chessboard
                options={{
                  id: 'arbiter-replay-board',
                  position: fen,
                  boardOrientation: flip ? 'black' : 'white',
                  squareStyles,
                  onSquareClick,
                  onPieceDrop,
                  allowDragging: exploring,
                  canDragPiece: ({ piece }) => exploring && piece.pieceType.charAt(0) === turn,
                  animationDurationInMs: 180,
                  dragActivationDistance: 10,
                  showNotation: true,
                  darkSquareStyle: { backgroundColor: 'var(--color-board-dark)' },
                  lightSquareStyle: { backgroundColor: 'var(--color-board-light)' },
                }}
              />

              {pendingPromotion ? (
                <div className="absolute inset-0 z-20 flex items-end justify-center bg-canvas/90 p-3 backdrop-blur-sm sm:items-center">
                  <div
                    role="dialog"
                    aria-label="Choose a piece to promote to"
                    className="w-full max-w-sm border-2 border-ink bg-surface px-4 py-4 text-center shadow-brut"
                  >
                    <p className="mt-1 text-[15px] font-bold text-ink">Promote the pawn to</p>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {(['q', 'r', 'b', 'n'] as const).map((piece) => {
                        const Icon = defaultPieces[`${turn}${piece.toUpperCase()}`];
                        return (
                          <button
                            key={piece}
                            type="button"
                            onClick={() => {
                              const move = pendingPromotion;
                              setPendingPromotion(null);
                              if (move) applyExplore(move.from, move.to, piece);
                            }}
                            aria-label={{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[piece]}
                            className="press flex min-h-14 flex-col items-center justify-center gap-1 border-2 border-ink bg-surface p-1.5 text-ink shadow-brut-sm hover:bg-bone"
                          >
                            <span className="block h-8 w-8" aria-hidden="true">
                              <Icon />
                            </span>
                            <span className="font-mono text-[10px] tracking-[0.1em] uppercase">{piece}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingPromotion(null)}
                      className="mt-3 w-full border-2 border-line-strong px-3 py-2 text-[12px] font-medium text-ink hover:bg-bone"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <PlayerBoardRow
              side={bottomSide}
              name={displayName(bottomSide)}
              rating={displayRating(bottomSide)}
              captures={piecesFor(bottomSide)}
              material={materialFor(bottomSide)}
              clock={recordedClock(bottomSide)}
              active={!exploring && turn === bottomSide}
            />
          </div>
        </div>

        {/* ── Transport & utilities ───────────────────────────────── */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button type="button" className={buttonClass} onClick={() => seek(0)} disabled={ply === 0} aria-label="First move">
            ⏮
          </button>
          <button type="button" className={buttonClass} onClick={() => seek(ply - 1)} disabled={ply === 0} aria-label="Previous move">
            ◀
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => seek(ply + 1)}
            disabled={ply === moves.length}
            aria-label="Next move"
          >
            ▶
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => seek(moves.length)}
            disabled={ply === moves.length}
            aria-label="Last move"
          >
            ⏭
          </button>

          <span className="ml-1 font-mono text-[11px] text-muted tabular-nums">
            move {Math.ceil(ply / 2) || 1}
            {ply === 0 ? ' · start' : ply % 2 === 1 ? ' (white)' : ' (black)'}
          </span>

          <span className="flex-1" aria-hidden="true" />

          <button type="button" className={buttonClass} onClick={() => setFlip((value) => !value)} aria-pressed={flip}>
            Flip board
          </button>
          <button type="button" className={buttonClass} onClick={() => void copyFen()}>
            {copied ? 'Copied' : 'Copy FEN'}
          </button>
          {exportUrl ? (
            <a
              href={exportUrl}
              download={`${white}-vs-${black}.pgn`.replace(/[\\/:*?"<>|]/g, '-')}
              className="press min-h-9 border-2 border-ink bg-accent px-2.5 py-1 font-mono text-[11px] font-bold text-on-accent shadow-brut-sm"
            >
              PGN
            </a>
          ) : null}
        </div>

        <p className="mt-1.5 flex min-h-5 items-center gap-2 text-[12px] text-muted">
          {inCheck(fen) ? <span className="badge border-0 bg-loss-bg text-loss-fg">Check</span> : null}
          {!exploring && result ? <span className="font-mono text-[13px] text-ink-soft">{result}</span> : null}
          <span aria-hidden="true">·</span>
          <span>
            {exploring
              ? 'Exploratory moves — ← → steps the branch; Return folds the game back.'
              : `Arrow keys step the game. ${moves.length} half-move${moves.length === 1 ? '' : 's'} on record.`}
          </span>
        </p>
      </section>

      {/* ══ COLUMN 2 · engine HUD + move table ══════════════════════ */}
      <section className="flex min-w-0 flex-col gap-4 xl:max-h-[calc(66dvh+13rem)] xl:overflow-hidden">
        <EnginePanel fen={fen} />

        <section className="flex min-h-48 flex-1 flex-col border-2 border-line bg-surface shadow-brut">
          <header className="flex items-center justify-between border-b-2 border-line px-4 py-2.5">
            <h2 className="font-mono text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink">Moves</h2>
            <span className="hidden font-mono text-[10px] text-muted sm:block">← → step</span>
          </header>
          <div className="flex flex-wrap items-center gap-1 border-b-2 border-line px-3 py-2">
            {MOVE_FILTERS.map((filter) => {
              const count = filterCounts.get(filter.id) ?? 0;
              const activeFilter = moveFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setMoveFilter(filter.id)}
                  aria-pressed={activeFilter}
                  className={`press border-2 px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.04em] uppercase transition-colors ${
                    activeFilter ? 'border-ink bg-ink text-canvas' : 'border-line text-muted hover:text-ink'
                  }`}
                >
                  {filter.label}
                  <span className={activeFilter ? 'tabular-nums' : 'tabular-nums opacity-70'}> {count}</span>
                </button>
              );
            })}
          </div>
          <div className="min-h-40 flex-1 space-y-px overflow-y-auto px-2 py-1.5 font-mono text-[12px]">
            {moves.length === 0 ? (
              <p className="px-2 py-3 text-muted">No recorded moves.</p>
            ) : (
              Array.from({ length: Math.ceil(moves.length / 2) }, (_, row) => {
                const plies = [row * 2 + 1, row * 2 + 2];
                return (
                  <div key={row} className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)] items-stretch">
                    <span className="self-center pl-1.5 text-[11px] text-muted tabular-nums">{row + 1}.</span>
                    {plies.map((movePly) => {
                      const index = movePly - 1;
                      if (index >= moves.length) return <span key={movePly} aria-hidden="true" />;
                      const move = moves[index];
                      const verdict = moveVerdicts[index];
                      const isCurrent = moveFilter === 'all' && currentPly === movePly;
                      const hidden = moveFilter !== 'all' && moveVerdicts[index] !== moveFilter;
                      if (hidden && verdict !== moveFilter) return <span key={movePly} aria-hidden="true" />;
                      return (
                        <button
                          key={movePly}
                          type="button"
                          ref={isCurrent ? activeCellRef : undefined}
                          onClick={() => seek(movePly)}
                          aria-current={isCurrent ? 'true' : undefined}
                          title={verdict ? verdict : undefined}
                          className={`flex items-center justify-between gap-1.5 border-l-2 px-2 py-1 text-left transition-colors ${
                            isCurrent
                              ? 'border-accent bg-bone text-ink'
                              : 'border-transparent hover:border-line hover:bg-bone'
                          }`}
                        >
                          <span className="truncate">{move.san}</span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {verdict ? (
                              <span
                                className={`text-[9px] font-bold tracking-[0.04em] uppercase ${
                                  verdict !== 'forced' ? '' : 'text-muted'
                                }`}
                                style={verdict !== 'forced' ? { color: VERDICT_COLOR[verdict] } : undefined}
                              >
                                {TAG_LABEL[verdict]}
                              </span>
                            ) : null}
                            {move.clk != null ? (
                              <span className="text-[10px] text-muted tabular-nums">{formatClock(move.clk)}</span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </section>

      {/* ══ COLUMN 3 · post-game analytics ══════════════════════════ */}
      <div className="min-w-0 space-y-4 lg:col-span-2 xl:col-span-1 xl:max-h-[calc(66dvh+13rem)] xl:overflow-y-auto xl:pr-1">
        <GameReview
          initialFen={startFen}
          moves={moves}
          whiteRating={whiteRating}
          blackRating={blackRating}
          selectedPly={ply}
          onSelectPly={seek}
          onReviewsChange={setMoveVerdicts}
          onScoresChange={setReviewScores}
        />
      </div>
    </div>
  );
}
