'use client';

import { Chess } from 'chess.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { Chessboard, defaultPieces } from 'react-chessboard';

import EnginePanel from '@/components/engine-panel';
import GameReview from '@/components/game-review';
import { VERDICT_COLOR, VerdictToken } from '@/components/verdict-badge';
import PlayerBoardRow from '@/components/player-board-row';
import { kingSquare, targetsFrom, type MoveTarget, type Side } from '@/lib/chess-ui';
import { capturedPieces, materialAdvantage } from '@/lib/material';
import { formatClockTiles } from '@/lib/time-controls';
import type { ReviewMove } from '@/components/game-review';
import type { MoveVerdict } from '@/lib/review';

/**
 * The completed game's board.
 *
 * A finished game cannot be changed and should not look like it can: the main
 * position is stepped through, not played. The one way this board moves on its
 * own is the exploration branch — clear off the recorded game, labelled "You
 * are exploring", and reading only until the player presses back to the
 * record. Nothing underneath it is written to.
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
           the absence of an alternative, not the move. */
        const verdict = moveVerdicts[ply - 1];
        if (verdict && verdict !== 'forced') {
          paint(last.uci.slice(2, 4), {
            boxShadow: `inset 0 0 0 4px color-mix(in srgb, ${VERDICT_COLOR[verdict]} 70%, transparent)`,
          });
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

  const buttonClass =
    'press min-h-10 border-2 border-line-strong bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-bone disabled:opacity-40';

  return (
    <div aria-label={`Game ${gameId} replay`} className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
      <div className="min-w-0 space-y-3">
        {exploring ? (
          <div className="flex flex-wrap items-center gap-2 border-2 border-info-fg bg-info-bg px-3 py-2">
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
              <button type="button" onClick={() => seek(ply)} className="press min-h-10 border-2 border-info-fg bg-surface px-3 py-1.5 text-[13px] font-bold text-info-fg">
                Return to the game
              </button>
            </div>
          </div>
        ) : null}

        <PlayerBoardRow
          side={topSide}
          name={displayName(topSide)}
          rating={displayRating(topSide)}
          captures={piecesFor(topSide)}
          material={materialFor(topSide)}
          clock={recordedClock(topSide)}
          active={!exploring && turn === topSide}
        />
        <div className="board-shell relative mx-auto aspect-square w-full max-w-[min(100%,70dvh)] overflow-hidden border-2 border-line select-none">
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

        {/* ── Navigation ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
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
            {flip ? 'Black' : 'White'} at the bottom
          </button>
          <button type="button" className={buttonClass} onClick={() => void copyFen()}>
            {copied ? 'Position copied' : 'Copy FEN'}
          </button>
          {exportUrl ? (
            <a
              href={exportUrl}
              download={`${white}-vs-${black}.pgn`.replace(/[\\/:*?"<>|]/g, '-')}
              className="press inline-flex min-h-10 items-center border-2 border-ink bg-accent px-3 py-1.5 text-[13px] font-bold text-on-accent shadow-brut-sm"
            >
              Export PGN
            </a>
          ) : null}
        </div>

        <p className="flex min-h-5 items-center gap-2 text-[12px] text-muted">
          {inCheck(fen) ? (
            <span className="badge border-0 bg-loss-bg text-loss-fg">Check</span>
          ) : null}
          {!exploring && result ? <span className="font-mono text-[13px] text-ink-soft">Result {result}</span> : null}
          <span aria-hidden="true">·</span>
          <span>
            {exploring ? 'Exploratory moves — use the keys ← → or the buttons to fold the game back.' : `Arrow keys step the game. ${moves.length} half-move${moves.length === 1 ? '' : 's'} on record.`}
          </span>
        </p>

      </div>

      <aside className="min-w-0 space-y-4">
        <section className="overflow-hidden border-2 border-line bg-surface shadow-brut">
          <header className="border-b-2 border-line px-4 py-2.5 sm:px-5">
            <h2 className="text-[13px] font-semibold text-ink">Moves</h2>
          </header>
          <ol className="max-h-72 overflow-y-auto px-4 py-2.5 font-mono text-[13px] sm:px-5">
            {moves.length === 0 ? (
              <li className="text-muted">No recorded moves.</li>
            ) : (
              moves.map((move, index) => {
                const movePly = index + 1;
                const isCurrent = !exploring && ply === movePly;
                return (
                  <li key={index} className="inline-block align-top" aria-hidden={false}>
                    <button
                      type="button"
                      onClick={() => seek(movePly)}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={`badge m-0.5 ${isCurrent ? 'bg-ink text-canvas' : 'bg-surface text-ink hover:bg-bone'}`}
                    >
                      <span className="text-muted tabular-nums">
                        {Math.ceil(movePly / 2)}
                        {movePly % 2 === 1 ? '.' : '…'}
                      </span>
                      {move.san}
                      {moveVerdicts[index] ? (
                        <span className="ml-1 align-super" aria-label={moveVerdicts[index]}>
                          <VerdictToken verdict={moveVerdicts[index]} />
                        </span>
                      ) : null}
                      {move.clk != null ? <span className="ml-1 text-muted">{formatClockTiles(move.clk * 1000)}</span> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ol>
        </section>

        <EnginePanel fen={fen} />

        <GameReview
          initialFen={startFen}
          moves={moves}
          whiteRating={whiteRating}
          blackRating={blackRating}
          selectedPly={ply}
          onSelectPly={seek}
          onReviewsChange={setMoveVerdicts}
        />
      </aside>
    </div>
  );
}
