'use client';

import { useEffect, useState } from 'react';

import { detectSacrifice, classifyMove, expectedPoints, accuracyFromLosses, isBookMove, type MoveVerdict } from '@/lib/review';
import { parsePgn } from '@/lib/pgn';
import { useEngine } from '@/lib/use-engine';
import { listProfiles, rememberProfile, type ProfileEntry } from '@/lib/local-user';
import { averageAccuracy, averageBlundersPerMatch, averageGameRating as meanGameRating } from '@/lib/profile-metrics';

type RemoteGame = {
  end_time?: number;
  time_class?: string;
  pgn?: string;
  result: string;
  white?: { username?: string; rating?: number };
  black?: { username?: string; rating?: number };
};
type Payload = {
  error?: string;
  profile?: {
    username: string;
    name: string;
    bestRatings?: Record<string, number | null>;
  };
  games?: RemoteGame[];
};
type Summary = {
  verdicts: Record<MoveVerdict, number>;
  phases: Record<'w' | 'b', [number, number, number]>;
  losses: Record<string, number[]>;
  modeLosses: Record<string, number[]>;
  openings: Record<string, number>;
  outcomes: { wins: number; draws: number; losses: number };
  games: number;
  playerBlunders: number;
  playerAccuracyTotal: number;
  playerAccuracyGames: number;
};

const emptySummary = (): Summary => ({
  verdicts: { brilliant: 0, great: 0, book: 0, best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 },
  phases: { w: [0, 0, 0], b: [0, 0, 0] },
  losses: {},
  modeLosses: {},
  openings: {},
  outcomes: { wins: 0, draws: 0, losses: 0 },
  games: 0,
  playerBlunders: 0,
  playerAccuracyTotal: 0,
  playerAccuracyGames: 0,
});
const VERDICT_TILES: MoveVerdict[] = [
  'brilliant', 'great', 'best', 'excellent', 'book', 'good',
  'inaccuracy', 'mistake', 'miss', 'blunder',
];
const VERDICT_NAMES: Record<MoveVerdict, string> = {
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
const VERDICT_COLORS: Record<MoveVerdict, string> = {
  brilliant: 'bg-info-bg text-info-fg',
  great: 'bg-info-bg text-info-fg',
  book: 'bg-bone text-muted',
  best: 'bg-win-bg text-win-fg',
  excellent: 'bg-win-bg text-win-fg',
  good: 'bg-bone text-muted',
  inaccuracy: 'bg-draw-bg text-draw-fg',
  mistake: 'bg-loss-bg text-loss-fg',
  miss: 'bg-loss-bg text-loss-fg',
  blunder: 'bg-loss-fg text-loss-bg',
};
const openingName = (opening: string) => opening.replace(/^[A-E]\d{1,2}\s*[-:·]?\s*/i, '').trim();

export default function ProfilePage() {
  const { ready, error: engineError, analyse } = useEngine();
  const [username, setUsername] = useState('');
  const [gameCount, setGameCount] = useState('100');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    setProfiles(listProfiles());
  }, []);

  const fetchProfile = async (raw: string) => {
    const name = raw.trim();
    if (!name || loading || running) return;
    const requestedGames = gameCount.trim().toLowerCase();
    if (requestedGames !== 'all' && (!/^\d+$/.test(requestedGames) || Number(requestedGames) < 1)) {
      setError('Enter a positive game count or “all”.');
      return;
    }
    setUsername(name);
    setLoading(true);
    setError(null);
    setSummary(null);
    setPayload(null);
    try {
      const query = new URLSearchParams({ limit: requestedGames, months: 'all' });
      const response = await fetch(`/api/chesscom/${encodeURIComponent(name)}?${query}`);
      const body = await response.json() as Payload;
      if (!response.ok) throw new Error(body.error ?? 'Chess.com could not be reached.');
      setPayload(body);
      if (body.profile) {
        rememberProfile(name, body.profile.name);
        setProfiles(listProfiles());
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chess.com could not be reached.');
    } finally {
      setLoading(false);
    }
  };

  const runReport = async () => {
    const games = payload?.games?.filter((game) => game.pgn) ?? [];
    if (!games.length || !ready || running) return;
    setRunning(true);
    setError(null);
    setProgress(0);
    const report = emptySummary();
    const totalPositions = games.reduce((sum, game) => {
      try { return sum + parsePgn(game.pgn!).reduce((count, parsed) => count + parsed.moves.length + 1, 0); }
      catch { return sum; }
    }, 0);
    let done = 0;
    try {
      for (const remote of games) {
        const game = parsePgn(remote.pgn!)[0];
        report.games += 1;
        if (game.opening) report.openings[game.opening] = (report.openings[game.opening] ?? 0) + 1;
        const isWhite = remote.white?.username?.toLowerCase() === username.trim().toLowerCase();
        const ownColor: 'w' | 'b' = isWhite ? 'w' : 'b';
        if (remote.result === '1/2-1/2') report.outcomes.draws += 1;
        else if ((isWhite && remote.result === '1-0') || (!isWhite && remote.result === '0-1')) report.outcomes.wins += 1;
        else report.outcomes.losses += 1;
        const positions = [game.startFen, ...game.moves.map((move) => move.fen)];
        const scores: number[] = [];
        const best: (string | null)[] = [];
        const gameLosses: number[] = [];
        const playerLosses: number[] = [];
        const playerEpLosses: number[] = [];
        for (const fen of positions) {
          const turn = fen.split(' ')[1] === 'w' ? 'w' : 'b';
          const score = await analyse(fen, 8);
          const cp = score.mate != null ? (score.mate > 0 ? 10000 : -10000) : score.cp ?? 0;
          scores.push(turn === 'w' ? cp : -cp);
          best.push(score.best);
          done += 1;
          setProgress(Math.round(done / Math.max(1, totalPositions) * 100));
        }
        const mode = remote.time_class ?? 'unknown';
        for (let index = 0; index < game.moves.length; index += 1) {
          const move = game.moves[index];
          const mover = positions[index].split(' ')[1] === 'w' ? 'w' : 'b';
          /* Expected points from the mover's own seat and rating, so the
             ladder matches the analyzer's grading. */
          const moverCp = (cp: number) => (mover === 'w' ? cp : -cp);
          const moverRating = mover === 'w' ? remote.white?.rating : remote.black?.rating;
          const expectedBefore = expectedPoints(moverCp(scores[index]), moverRating);
          const expectedAfter = expectedPoints(moverCp(scores[index + 1]), moverRating);
          const loss = Math.max(0, mover === 'w' ? scores[index] - scores[index + 1] : scores[index + 1] - scores[index]);
          const verdict = classifyMove(expectedBefore, expectedAfter, {
            matchesBestMove: best[index] === move.uci,
            sacrifice: detectSacrifice(positions[index + 1], best[index + 1]),
            book: isBookMove(game.moves.slice(0, index + 1).map((entry) => entry.san)),
          });
          report.verdicts[verdict] += 1;
          if (mover === ownColor) {
            playerLosses.push(loss);
            playerEpLosses.push(Math.max(0, Math.min(1, expectedBefore - expectedAfter)));
            if (verdict === 'blunder') report.playerBlunders += 1;
          }
          const moveNumber = Math.ceil((index + 1) / 2);
          const phase = moveNumber <= 10 ? 0 : moveNumber <= 30 ? 1 : 2;
          if (verdict === 'blunder') report.phases[mover][phase] += 1;
          if (mover === ownColor) {
            gameLosses.push(loss);
            (report.modeLosses[mode] ??= []).push(loss);
          }
        }
        if (gameLosses.length) {
          const averageLoss = gameLosses.reduce((sum, loss) => sum + loss, 0) / gameLosses.length;
          (report.losses[mode] ??= []).push(averageLoss);
        }
        if (playerEpLosses.length) {
          report.playerAccuracyTotal += accuracyFromLosses(playerEpLosses);
          report.playerAccuracyGames += 1;
        }
      }
      setSummary(report);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The profile report could not be completed.');
    } finally {
      setRunning(false);
    }
  };

  const ratings = payload?.games?.map((game) => {
    const isWhite = game.white?.username?.toLowerCase() === (payload.profile?.username ?? username).toLowerCase();
    return { mode: game.time_class ?? 'unknown', rating: isWhite ? game.white?.rating : game.black?.rating, date: game.end_time ?? 0 };
  }).filter((point): point is { mode: string; rating: number; date: number } => point.rating != null).reverse() ?? [];
  const averageRating = meanGameRating(ratings.map((point) => point.rating));
  const bestRatings = payload?.profile?.bestRatings ?? {};
  const meanAccuracy = summary
    ? averageAccuracy(summary.playerAccuracyTotal, summary.playerAccuracyGames)
    : null;
  const ratingModes = [...new Set([
    ...ratings.map((point) => point.mode),
    ...Object.keys(bestRatings).filter((mode) => bestRatings[mode] != null),
  ])];

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 max-w-3xl">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Player report</p>
        <h1 className="mt-3 text-[clamp(2.2rem,5vw,3.7rem)] leading-none font-extrabold tracking-[-0.045em] text-ink">Profile analysis.</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">A browser-computed snapshot of recent games, rating history, openings, and move-level patterns.</p>
      </header>

      <form onSubmit={(event) => { event.preventDefault(); void fetchProfile(username); }} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label htmlFor="profile-username" className="sr-only">Chess.com username</label>
        <input id="profile-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Chess.com username" className="field min-h-12 flex-1 px-4" />
        <label htmlFor="profile-game-count" className="field-label">
          Games
          <input
            id="profile-game-count"
            value={gameCount}
            onChange={(event) => setGameCount(event.target.value)}
            placeholder="100 or all"
            className="field mt-1 min-h-12 px-4 font-normal normal-case tracking-normal sm:w-36"
          />
        </label>
        <button disabled={loading || running} className="press min-h-12 border-2 border-ink bg-accent px-6 font-bold text-on-accent shadow-brut disabled:opacity-50">{loading ? 'Loading…' : 'Load profile'}</button>
      </form>
      {profiles.length ? <div className="mt-3 flex flex-wrap gap-2">{profiles.map((profile) => <button key={profile.username} type="button" onClick={() => { setUsername(profile.username); void fetchProfile(profile.username); }} className="badge bg-surface text-ink hover:bg-bone">{profile.name ?? profile.username}</button>)}</div> : null}
      {error || engineError ? <p role="alert" className="mt-5 border-2 border-loss-fg bg-loss-bg px-4 py-3 text-sm text-loss-fg">{error ?? engineError}</p> : null}
      {payload?.profile ? (
        <section className="mt-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-ink pb-4">
            <div><h2 className="text-2xl font-extrabold text-ink">{payload.profile.name}</h2><p className="text-[13px] text-muted">@{payload.profile.username} · {payload.games?.length ?? 0} games</p></div>
            <button type="button" onClick={() => void runReport()} disabled={!ready || running || !payload.games?.length} className="press min-h-11 border-2 border-ink bg-accent px-5 font-bold text-on-accent shadow-brut disabled:opacity-40">{running ? `Analyzing ${progress}%` : engineError ? 'Engine unavailable' : 'Run move report'}</button>
          </div>
          {running ? <div className="h-3 border-2 border-ink bg-surface"><div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} /></div> : null}
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="border-2 border-line bg-surface p-4">
              <p className="text-[11px] font-bold text-muted uppercase">Average game rating</p>
              <p className="mt-2 font-mono text-2xl tabular-nums text-ink">{averageRating ?? '—'}</p>
            </div>
            {summary ? (
              <>
                <div className="border-2 border-line bg-surface p-4">
                  <p className="text-[11px] font-bold text-muted uppercase">Average blunders per match</p>
                  <p className="mt-2 font-mono text-2xl tabular-nums text-ink">{averageBlundersPerMatch(summary.playerBlunders, summary.games)?.toFixed(1) ?? '—'}</p>
                </div>
                <div className="border-2 border-line bg-surface p-4">
                  <p className="text-[11px] font-bold text-muted uppercase">Average accuracy</p>
                  <p className="mt-2 font-mono text-2xl tabular-nums text-ink">
                    {meanAccuracy == null ? '—' : `${meanAccuracy.toFixed(1)}%`}
                  </p>
                </div>
              </>
            ) : null}
          </section>
          <section className="border-2 border-ink bg-surface p-4 shadow-brut">
            <h3 className="font-bold text-ink">Rating by mode</h3>
            {ratingModes.length ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {ratingModes.map((mode) => {
                  const series = ratings.filter((point) => point.mode === mode);
                  const minRating = series.length ? Math.min(...series.map((point) => point.rating)) : null;
                  const maxRating = series.length ? Math.max(...series.map((point) => point.rating)) : null;
                  const padding = minRating != null && maxRating != null
                    ? Math.max(25, (maxRating - minRating) * 0.1)
                    : 0;
                  const lowerBound = (minRating ?? 0) - padding;
                  const ratingRange = (maxRating ?? 0) - (minRating ?? 0) + padding * 2;
                  const yForRating = (rating: number) => 110 - ((rating - lowerBound) / Math.max(1, ratingRange)) * 100;
                  const points = series.map((point, index) => `${index / Math.max(1, series.length - 1) * 600},${yForRating(point.rating)}`).join(' ');
                  const highestRating = bestRatings[mode] ?? maxRating;
                  return (
                    <div key={mode} className="border-2 border-line bg-surface p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[12px] font-bold capitalize text-ink">{mode}</p>
                        <p className="font-mono text-[10px] text-muted">
                          Highest {highestRating ?? '—'}
                        </p>
                      </div>
                      {series.length ? (
                        <>
                          <svg viewBox="0 0 600 120" className="mt-2 h-28 w-full" preserveAspectRatio="none" role="img" aria-label={`${mode} rating history`}>
                            <line x1="0" y1="110" x2="600" y2="110" stroke="var(--color-line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                            <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                            {series.length === 1 ? <circle cx="300" cy={yForRating(series[0].rating)} r="5" fill="var(--color-accent)" /> : null}
                          </svg>
                          <p className="font-mono text-[10px] text-muted">{minRating}–{maxRating} · {series.length} games</p>
                        </>
                      ) : <p className="mt-3 text-[11px] text-muted">No games in this selection.</p>}
                    </div>
                  );
                })}
              </div>
            ) : <p className="mt-2 text-[12px] text-muted">No rated games in this recent sample.</p>}
          </section>
          {summary ? (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">                  {VERDICT_TILES.map((verdict) => <div key={verdict} className={`border-2 border-line p-4 ${VERDICT_COLORS[verdict]}`}><p className="text-[11px] font-bold uppercase">{VERDICT_NAMES[verdict]}</p><p className="mt-2 font-mono text-3xl tabular-nums">{summary.verdicts[verdict]}</p></div>)}
              </section>
              <section className="grid gap-5 lg:grid-cols-2">
                <div className="border-2 border-ink bg-surface p-5 shadow-brut">
                  <h3 className="font-bold text-ink">Most-blundered phase</h3>
                  {(['w', 'b'] as const).map((side) => <div key={side} className="mt-3"><p className="text-[12px] font-bold text-ink">{side === 'w' ? 'White' : 'Black'}</p><div className="mt-1 flex h-3 overflow-hidden border border-line" aria-label={`${side === 'w' ? 'White' : 'Black'} blunder phase counts`}>{summary.phases[side].map((count, index) => <span key={index} className={['bg-info-fg', 'bg-draw-fg', 'bg-loss-fg'][index]} style={{ width: `${count / Math.max(1, summary.phases[side].reduce((sum, value) => sum + value, 0)) * 100}%` }} title={`${['Early', 'Middle', 'Late'][index]}: ${count}`} />)}</div><p className="text-[11px] text-muted">early {summary.phases[side][0]} · middle {summary.phases[side][1]} · late {summary.phases[side][2]}</p></div>)}
                  <p className="mt-3 text-[11px] text-muted">Move phases: early 1–10, middle 11–30, late 31+.</p>
                </div>
                <div className="border-2 border-ink bg-surface p-5 shadow-brut">
                  <h3 className="font-bold text-ink">Favorite openings</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5">{Object.entries(summary.openings).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([opening, count]) => <li key={opening} className="flex justify-between gap-3 text-[13px] text-ink"><span>{openingName(opening)}</span><span className="font-mono text-muted">{count}</span></li>)}</ul>
                </div>
              </section>
              <section className="border-2 border-ink bg-surface p-5 shadow-brut">
                <h3 className="font-bold text-ink">Average centipawn loss trend by mode</h3>
                <svg viewBox="0 0 600 120" className="mt-3 h-32 w-full" preserveAspectRatio="none" role="img" aria-label="Average centipawn loss trend by mode">
                  {[...new Set(Object.keys(summary.losses))].map((mode, index) => {
                    const values = summary.losses[mode];
                    const points = values.map((loss, pointIndex) => `${pointIndex / Math.max(1, values.length - 1) * 600},${110 - Math.max(0, Math.min(1, loss / 500)) * 100}`).join(' ');
                    return <polyline key={mode} points={points} fill="none" stroke={['var(--color-ink)', 'var(--color-accent)', 'var(--color-win-fg)', 'var(--color-loss-fg)'][index % 4]} strokeWidth="2" vectorEffect="non-scaling-stroke" />;
                  })}
                </svg>
                <div className="mt-3 flex flex-wrap gap-3">{Object.entries(summary.modeLosses).map(([mode, losses]) => {
                  const mean = losses.reduce((sum, loss) => sum + loss, 0) / Math.max(1, losses.length);
                  return <span key={mode} className="badge bg-bone text-ink">{mode} · {Math.round(mean)} cp loss</span>;
                })}</div>
              </section>
              <section className="border-2 border-ink bg-surface p-5 shadow-brut"><h3 className="font-bold text-ink">Win / draw / loss</h3><p className="mt-2 text-[13px] text-muted">{summary.outcomes.wins} wins · {summary.outcomes.draws} draws · {summary.outcomes.losses} losses · {summary.games} games</p></section>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
