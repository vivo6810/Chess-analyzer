'use client';

import { Chess } from 'chess.js';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chessboard, defaultPieces, type PieceRenderObject } from 'react-chessboard';

import PlayerBoardRow from '@/components/player-board-row';
import { capturedPieces, materialAdvantage } from '@/lib/material';
import { TIME_CONTROLS, type TimeControl } from '@/lib/time-controls';
import { settleClock, type ClockFields } from '@/lib/clock';
import { evaluatePosition } from '@/lib/game';
import { DEFAULT_LEVEL_ID, ENGINE_LEVELS, getLevel, selectEngineMove } from '@/lib/engine-levels';
import { renderPgn, type PgnMove } from '@/lib/pgn';
import { useEngine } from '@/lib/use-engine';
import { rememberAnalysis, analysisId } from '@/lib/local-user';
import { kingSquare, targetsFrom, type MoveTarget } from '@/lib/chess-ui';

type GameMove = PgnMove & { mover: 'w' | 'b' };
type Status = 'idle' | 'playing' | 'finished';
const PLAY_CONTROLS = ['1+0', '3+0', '3+2', '5+0', '5+3', '10+0', '10+5', '15+10', 'untimed'];
const CONTROL_OPTIONS = PLAY_CONTROLS.map((id) => TIME_CONTROLS.find((control) => control.id === id)!).filter(Boolean);
const DOT: CSSProperties = { backgroundImage: 'radial-gradient(circle at 50% 50%, var(--color-canvas) 0 16%, var(--color-ink-soft) 17% 20%, transparent 21%)' };
const RING: CSSProperties = { backgroundImage: 'radial-gradient(circle at 50% 50%, transparent 0 35%, var(--color-canvas) 36% 47%, var(--color-ink-soft) 48% 52%, transparent 53%)' };
const CONFETTI = Array.from({ length: 32 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`,
  delay: `${(index % 9) * -0.17}s`,
  color: ['#629924', '#d99b26', '#eae6df', '#ff6b6b', '#a88865'][index % 5],
}));

function freshClock(control: TimeControl, now: number): ClockFields {
  return { white_ms: control.initialMs, black_ms: control.initialMs, increment_ms: control.incrementMs, per_move_ms: control.mode === 'per_move' ? control.initialMs : 0, turn_started_at: now };
}

export default function PlayPage() {
  const router = useRouter();
  const { ready, error: engineError, analyse } = useEngine();
  const gameRef = useRef(new Chess());
  const clockRef = useRef<ClockFields>(freshClock(CONTROL_OPTIONS.find((item) => item.id === '5+3')!, Date.now()));
  const movesRef = useRef<GameMove[]>([]);
  const thinkingRef = useRef(false);
  const gameOverRef = useRef(false);
  const [status, setStatus] = useState<Status>('idle');
  const [levelId, setLevelId] = useState(DEFAULT_LEVEL_ID);
  const [sideChoice, setSideChoice] = useState<'white' | 'black' | 'random'>('white');
  const [playerSide, setPlayerSide] = useState<'w' | 'b'>('w');
  const [control, setControl] = useState(CONTROL_OPTIONS.find((item) => item.id === '5+3')!);
  const [fen, setFen] = useState(gameRef.current.fen());
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [clock, setClock] = useState(clockRef.current);
  const [now, setNow] = useState(Date.now());
  const [thinking, setThinking] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [termination, setTermination] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentTurn = fen.split(' ')[1] === 'w' ? 'w' : 'b';
  const captured = useMemo(() => capturedPieces(new Chess().fen(), fen), [fen]);
  const topSide: 'w' | 'b' = playerSide === 'w' ? 'b' : 'w';
  const bottomSide: 'w' | 'b' = playerSide;
  const sideName = (side: 'w' | 'b') => side === playerSide ? 'You' : `Engine L${levelId}`;
  const sideCaptures = (side: 'w' | 'b') => side === 'w' ? captured.whiteHas : captured.blackHas;
  const level = getLevel(levelId);
  const losingKing = status === 'finished' && result && gameRef.current.isCheckmate()
    ? currentTurn
    : null;
  const winner = result === '1-0' ? 'w' : result === '0-1' ? 'b' : null;
  const playerWon = winner === playerSide;
  const playerLost = status === 'finished' && winner != null && !playerWon;
  const activeClockMs = (side: 'w' | 'b') => {
    const bank = side === 'w' ? clock.white_ms : clock.black_ms;
    if (status !== 'playing' || currentTurn !== side || control.mode === 'none') return bank;
    return Math.max(0, bank - Math.max(0, now - clock.turn_started_at));
  };

  const finish = useCallback((outcome: { result: string; termination: string }) => {
    gameOverRef.current = true;
    setResult(outcome.result);
    setTermination(outcome.termination);
    setStatus('finished');
    setThinking(false);
    thinkingRef.current = false;
  }, []);

  const pushMove = (san: string, uci: string, resultingFen: string, mover: 'w' | 'b', remaining: number) => {
    const move: GameMove = { san, uci, fen: resultingFen, mover, clk: control.mode === 'none' ? undefined : Math.max(0, remaining / 1000) };
    movesRef.current = [...movesRef.current, move];
    setMoves(movesRef.current);
    setFen(resultingFen);
  };

  const runEngineTurn = useCallback(async (currentFen: string) => {
    if (thinkingRef.current || status === 'finished') return;
    thinkingRef.current = true;
    setThinking(true);
    setError(null);
    try {
      const side = currentFen.split(' ')[1] === 'w' ? 'w' : 'b';
      const score = await analyse(currentFen, level.depth);
      if (gameOverRef.current) return;
      const choice = selectEngineMove(currentFen, level, score.best);
      const from = choice.uci.slice(0, 2);
      const to = choice.uci.slice(2, 4);
      const promotion = choice.uci[4];
      const settled = settleClock(clockRef.current, side, Date.now(), control);
      clockRef.current = { ...clockRef.current, white_ms: settled.whiteMs, black_ms: settled.blackMs, turn_started_at: Date.now() };
      setClock(clockRef.current);
      if (settled.flagged) {
        finish({ result: settled.flagged === 'white' ? '0-1' : '1-0', termination: 'time' });
        return;
      }
      const chess = gameRef.current;
      const applied = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
      pushMove(applied.san, `${applied.from}${applied.to}${applied.promotion ?? ''}`, chess.fen(), side, side === 'w' ? settled.whiteMs : settled.blackMs);
      const over = evaluatePosition(chess);
      if (over) finish(over);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The engine could not make a move.');
    } finally {
      thinkingRef.current = false;
      setThinking(false);
    }
  }, [analyse, control, finish, level, status]);

  useEffect(() => {
    if (status !== 'playing') return;
    const timer = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (control.mode === 'none') return;
      const turn = gameRef.current.turn();
      const bank = turn === 'w' ? clockRef.current.white_ms : clockRef.current.black_ms;
      if (timestamp - clockRef.current.turn_started_at >= bank) {
        finish({ result: turn === 'w' ? '0-1' : '1-0', termination: 'time' });
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [control.mode, finish, status]);

  const startGame = () => {
    if (status !== 'idle') return;
    const side = sideChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : sideChoice === 'white' ? 'w' : 'b';
    const timestamp = Date.now();
    gameOverRef.current = false;
    gameRef.current = new Chess();
    movesRef.current = [];
    clockRef.current = freshClock(control, timestamp);
    setClock(clockRef.current);
    setMoves([]);
    setFen(gameRef.current.fen());
    setPlayerSide(side);
    setResult(null);
    setTermination(null);
    setStatus('playing');
    setNow(timestamp);
    if (side === 'b') void runEngineTurn(gameRef.current.fen());
  };

  const applyUserMove = (from: string, to: string, promotion?: string) => {
    if (status !== 'playing' || thinkingRef.current || currentTurn !== playerSide) return false;
    const side = playerSide;
    const timestamp = Date.now();
    const chess = gameRef.current;
    try {
      new Chess(chess.fen()).move({ from, to, ...(promotion ? { promotion } : {}) });
    } catch {
      return false;
    }
    const settled = settleClock(clockRef.current, side, timestamp, control);
    clockRef.current = { ...clockRef.current, white_ms: settled.whiteMs, black_ms: settled.blackMs, turn_started_at: timestamp };
    setClock(clockRef.current);
    if (settled.flagged) {
      finish({ result: settled.flagged === 'white' ? '0-1' : '1-0', termination: 'time' });
      return false;
    }
    try {
      const applied = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
      const nextFen = chess.fen();
      pushMove(applied.san, `${applied.from}${applied.to}${applied.promotion ?? ''}`, nextFen, side, side === 'w' ? settled.whiteMs : settled.blackMs);
      setSelected(null);
      const over = evaluatePosition(chess);
      if (over) finish(over);
      else void runEngineTurn(nextFen);
      return true;
    } catch {
      return false;
    }
  };

  const legalTargets = useMemo<MoveTarget[]>(() => selected ? targetsFrom(fen, selected) : [], [fen, selected]);
  const pieces = useMemo<PieceRenderObject>(() => {
    if (!losingKing) return defaultPieces;
    const key = losingKing === 'w' ? 'wK' : 'bK';
    const Base = defaultPieces[key];
    return {
      ...defaultPieces,
      [key]: (props) => (
        <span className="fallen-king fallen-king--black">
          <Base {...props} />
        </span>
      ),
    };
  }, [losingKing]);
  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    if (selected) styles[selected] = { boxShadow: 'inset 0 0 0 4px var(--color-accent)' };
    for (const target of legalTargets) styles[target.to] = target.capture ? RING : DOT;
    if (gameRef.current.isCheck()) {
      const king = kingSquare(fen, currentTurn);
      if (king) styles[king] = { boxShadow: 'inset 0 0 0 4px var(--color-loss-fg)' };
    }
    return styles;
  }, [currentTurn, fen, legalTargets, selected]);

  const onSquareClick = useCallback(({ square }: { square: string }) => {
    if (status !== 'playing' || thinkingRef.current || currentTurn !== playerSide) return;
    const target = legalTargets.find((move) => move.to === square);
    if (selected && target) {
      if (target.promotion) setPendingPromotion({ from: selected, to: square });
      else applyUserMove(selected, square);
      return;
    }
    try {
      const piece = gameRef.current.get(square as never);
      setSelected(piece?.color === playerSide ? (selected === square ? null : square) : null);
    } catch {
      setSelected(null);
    }
  }, [currentTurn, legalTargets, playerSide, selected, status, thinking]);

  const onPieceDrop = useCallback(({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (!targetSquare || sourceSquare === targetSquare || status !== 'playing' || thinking) return false;
    const target = targetsFrom(fen, sourceSquare).find((move) => move.to === targetSquare);
    if (target?.promotion) {
      setPendingPromotion({ from: sourceSquare, to: targetSquare });
      return false;
    }
    return applyUserMove(sourceSquare, targetSquare);
  }, [fen, status, thinking]);

  const gamePgn = result ? renderPgn({
    Event: 'Arbiter vs Stockfish',
    White: playerSide === 'w' ? 'You' : `Engine L${levelId}`,
    Black: playerSide === 'b' ? 'You' : `Engine L${levelId}`,
    Result: result,
    TimeControl: control.id,
  }, moves, result) : '';

  const analyseGame = () => {
    if (!result) return;
    const white = playerSide === 'w' ? 'You' : `Engine L${levelId}`;
    const black = playerSide === 'b' ? 'You' : `Engine L${levelId}`;
    const id = analysisId(gamePgn);
    rememberAnalysis({ id, source: 'play', white, black, result }, gamePgn);
    try {
      sessionStorage.setItem('arbiter:handoff-pgn', gamePgn);
      router.push('/analysis');
    } catch {
      router.push(`/analysis?game=${encodeURIComponent(id)}`);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Play locally</p>
        <h1 className="mt-3 text-[clamp(2.2rem,5vw,3.7rem)] leading-none font-extrabold tracking-[-0.045em] text-ink">Take on Stockfish.</h1>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem_18rem]">
        <section className="min-w-0 space-y-3">
          {status !== 'idle' ? <PlayerBoardRow
            side={topSide}
            name={sideName(topSide)}
            captures={sideCaptures(topSide)}
            material={materialAdvantage(captured, topSide)}
            clock={control.mode === 'none' ? null : activeClockMs(topSide)}
            active={status === 'playing' && currentTurn === topSide}
          /> : null}
          <div className="board-shell relative mx-auto aspect-square w-full max-w-[min(100%,70dvh)] overflow-hidden border-2 border-line">
            <Chessboard options={{
              id: 'arbiter-play-board',
              position: fen,
              boardOrientation: playerSide === 'w' ? 'white' : 'black',
              pieces,
              squareStyles,
              onSquareClick,
              onPieceDrop,
              allowDragging: status === 'playing' && !thinking && currentTurn === playerSide,
              canDragPiece: ({ piece }) => status === 'playing' && !thinking && piece.pieceType.charAt(0) === playerSide,
              animationDurationInMs: 180,
              showNotation: true,
              darkSquareStyle: { backgroundColor: 'var(--color-board-dark)' },
              lightSquareStyle: { backgroundColor: 'var(--color-board-light)' },
            }} />
            {playerLost || playerWon ? (
              <div className="play-board-effects" aria-hidden="true">
                {playerLost ? <span className="play-board-loss-ripple" /> : null}
                {playerWon ? (
                  <div className="confetti">
                    {CONFETTI.map((piece, index) => (
                      <span
                        key={index}
                        className={`confetti__piece${index % 3 === 0 ? ' confetti__piece--thin' : ''}`}
                        style={{ left: piece.left, animationDelay: piece.delay, backgroundColor: piece.color }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
            {status !== 'idle' ? <PlayerBoardRow
              side={bottomSide}
              name={sideName(bottomSide)}
              captures={sideCaptures(bottomSide)}
              material={materialAdvantage(captured, bottomSide)}
              clock={control.mode === 'none' ? null : activeClockMs(bottomSide)}
              active={status === 'playing' && currentTurn === bottomSide}
            /> : null}
          {status === 'finished' ? <div className="border-2 border-ink bg-surface p-5 shadow-brut"><p className="font-mono text-[11px] uppercase text-muted">{termination ?? 'Game over'}</p><h2 className="mt-2 text-2xl font-extrabold text-ink">{result === '1-0' ? 'White wins' : result === '0-1' ? 'Black wins' : 'Draw'} · {result}</h2><button type="button" onClick={analyseGame} className="press mt-4 min-h-12 border-2 border-ink bg-accent px-5 font-bold text-on-accent shadow-brut">Analyse this game</button></div> : null}
          {error || engineError ? <p role="alert" className="border-2 border-loss-fg bg-loss-bg px-4 py-3 text-sm text-loss-fg">{error ?? engineError}</p> : null}
        </section>

        <section className="border-2 border-line bg-surface shadow-brut">
          <header className="border-b-2 border-line px-4 py-3"><h2 className="font-bold text-ink">Moves</h2></header>
          <ol className="max-h-[28rem] min-h-28 overflow-y-auto p-3 font-mono text-[13px]">
            {moves.length ? moves.map((move, index) => <li key={`${move.uci}-${index}`} className="inline-flex items-center gap-1"><span className="badge m-0.5 bg-bone text-ink">{Math.ceil((index + 1) / 2)}{move.mover === 'w' ? '.' : '…'} {move.san}{move.clk != null ? <span className="text-muted">{Math.floor(move.clk / 60)}:{String(Math.round(move.clk) % 60).padStart(2, '0')}</span> : null}</span></li>) : <li className="text-muted">Your moves appear here.</li>}
          </ol>
          {thinking ? <p className="border-t-2 border-line px-4 py-3 text-[12px] text-muted">Stockfish is thinking…</p> : null}
        </section>

        <aside className="space-y-4 border-2 border-ink bg-surface p-4 shadow-brut">
          <h2 className="text-[14px] font-extrabold text-ink">{status === 'idle' ? 'Game setup' : 'Game settings'}</h2>
          {status === 'idle' ? (
            <>
              <fieldset><legend className="field-label mb-2">Engine level</legend><div className="grid grid-cols-4 gap-1.5">{ENGINE_LEVELS.map((entry) => <button key={entry.id} type="button" aria-pressed={levelId === entry.id} onClick={() => setLevelId(entry.id)} className={`min-h-9 border-2 text-[12px] font-bold ${levelId === entry.id ? 'border-ink bg-ink text-canvas' : 'border-line text-ink hover:bg-bone'}`}>{entry.id}</button>)}</div><p className="mt-2 text-[11px] text-muted">Level {levelId} · search depth {level.depth}</p></fieldset>
              <fieldset><legend className="field-label mb-2">Play as</legend><div className="grid grid-cols-3 gap-1">{(['white', 'black', 'random'] as const).map((side) => <button key={side} type="button" aria-pressed={sideChoice === side} onClick={() => setSideChoice(side)} className={`min-h-9 border-2 px-2 text-[11px] font-bold capitalize ${sideChoice === side ? 'border-ink bg-ink text-canvas' : 'border-line text-ink hover:bg-bone'}`}>{side}</button>)}</div></fieldset>
              <fieldset><legend className="field-label mb-2">Time control</legend><div className="grid grid-cols-3 gap-1">{CONTROL_OPTIONS.map((item) => <button key={item.id} type="button" aria-pressed={control.id === item.id} onClick={() => setControl(item)} className={`min-h-9 border-2 px-1 text-[10px] font-bold ${control.id === item.id ? 'border-ink bg-ink text-canvas' : 'border-line text-ink hover:bg-bone'}`}>{item.label}</button>)}</div></fieldset>
              <button type="button" disabled={!ready || !!engineError} onClick={startGame} className="press min-h-12 w-full border-2 border-ink bg-accent px-4 font-bold text-on-accent shadow-brut disabled:opacity-40">{engineError ? 'Engine unavailable' : ready ? 'Start game' : 'Loading engine…'}</button>
            </>
          ) : (
            <>
              <p className="text-[13px] text-ink">Level {levelId} · {control.label}</p>
              <p className="text-[12px] text-muted">{thinking ? 'Engine turn in progress.' : status === 'finished' ? 'The game is complete.' : `Your turn as ${playerSide === 'w' ? 'White' : 'Black'}.`}</p>
            </>
          )}
        </aside>
      </div>

      {pendingPromotion ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"><div role="dialog" aria-label="Choose a piece to promote to" className="w-full max-w-sm border-2 border-ink bg-surface p-5 shadow-brut"><h2 className="font-bold text-ink">Promote the pawn to</h2><div className="mt-4 grid grid-cols-4 gap-2">{(['q', 'r', 'b', 'n'] as const).map((piece) => { const Icon = defaultPieces[`${playerSide}${piece.toUpperCase()}`]; return <button key={piece} type="button" onClick={() => { const choice = pendingPromotion; setPendingPromotion(null); if (choice) applyUserMove(choice.from, choice.to, piece); }} aria-label={{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[piece]} className="press flex min-h-16 flex-col items-center justify-center border-2 border-line hover:bg-bone"><span className="h-9 w-9"><Icon /></span><span className="font-mono text-xs uppercase">{piece}</span></button>; })}</div><button type="button" onClick={() => setPendingPromotion(null)} className="mt-3 min-h-10 w-full border-2 border-line text-sm">Cancel</button></div></div> : null}
    </div>
  );
}
