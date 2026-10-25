import Link from 'next/link';
import { notFound } from 'next/navigation';

import ChallengeBoard, { type ChallengeRow } from '@/components/challenge-board';
import { getCurrentUser } from '@/lib/auth';
import {
  findUserByUsername,
  gameHistory,
  historyOptionsFor,
  statsFor,
} from '@/lib/profiles';
import { incomingChallenges, outgoingChallenges, unfinishedGameIds } from '@/lib/challenge';
import { BASE_RATING } from '@/lib/rating';
import { getTournamentById } from '@/lib/service';
import { TIME_CONTROLS } from '@/lib/time-controls';

export const dynamic = 'force-dynamic';

function outcomeOf(result: string | null, playedWhite: boolean): 'w' | 'l' | 'd' | null {
  if (result === '1/2-1/2') return 'd';
  if (result === '1-0') return playedWhite ? 'w' : 'l';
  if (result === '0-1') return playedWhite ? 'l' : 'w';
  return null;
}

const BADGE_STYLE: Record<string, string> = {
  w: 'bg-win-bg text-win-fg',
  l: 'bg-loss-bg text-loss-fg',
  d: 'bg-draw-bg text-draw-fg',
};

const OUTCOME_LABEL = { w: 'Win', l: 'Loss', d: 'Draw' } as const;

/** The rating curve as an SVG line, in the house's flat-ink graph style. */
function RatingCurve({ curve }: { curve: { at: number; rating: number }[] }) {
  if (curve.length < 2) return null;

  const width = 600;
  const height = 96;
  const ratings = curve.map((point) => point.rating);
  const low = Math.min(...ratings, BASE_RATING);
  const high = Math.max(...ratings, BASE_RATING);
  const span = Math.max(40, high - low);

  const pointAt = (index: number, rating: number) => ({
    x: (index / (curve.length - 1)) * width,
    y: height - 4 - ((rating - low) / span) * (height - 12),
  });

  const line = curve
    .map((point, index) => {
      const { x, y } = pointAt(index, point.rating);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const current = curve[curve.length - 1];

  return (
    <div className="border-b-2 border-line px-5 py-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-bold tracking-[0.08em] text-muted uppercase">Rating, derived from results</p>
        <span className="font-mono text-[13px] text-ink tabular-nums">{current.rating}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-24 w-full" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1={height - 4 - ((BASE_RATING - low) / span) * (height - 12)} x2={width} y2={height - 4 - ((BASE_RATING - low) / span) * (height - 12)} stroke="var(--color-line-strong)" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <polyline points={line} fill="none" stroke="var(--color-ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <circle cx={width} cy={pointAt(curve.length - 1, current.rating).y} r="5" fill="var(--color-accent)" stroke="var(--color-ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
        <span>{curve.length} rated game{curve.length === 1 ? '' : 's'}</span>
        <span>start {BASE_RATING}</span>
      </div>
    </div>
  );
}

export default async function PlayerProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  /* The id in the URL is the username_key form the accounts table stores. */
  const user = findUserByUsername(decodeURIComponent(username));
  if (!user) notFound();

  const viewer = await getCurrentUser();
  const isSelf = viewer?.id === user.id;

  const stats = statsFor(user.id);
  const options = historyOptionsFor(user.id);
  const history = gameHistory(user.id, {});
  const recent = history.games.slice(0, 8);

  /* Challenges are only laid out to the person they belong to. A visitor gets
     the challenge form — sending is theirs — but not the standing list of
     someone else's conversations. */
  const boardIncoming = isSelf ? incomingChallenges(user.id) : [];
  const boardOutgoing = isSelf ? outgoingChallenges(user.id) : [];

  const activeGames = isSelf ? unfinishedGameIds(user.id) : [];

  const controlLabel = (id: string) => TIME_CONTROLS.find((control) => control.id === id)?.label ?? id;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      {/* ── Identity ───────────────────────────────────────────────── */}
      <header className="border-b-2 border-line pb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-extrabold text-[clamp(2rem,4.6vw,3rem)] leading-[1.04] tracking-[-0.04em] text-ink">
              {user.username}
            </h1>
            <p className="mt-2 text-[14px] text-muted">
              Player since {new Date(user.created_at).toISOString().slice(0, 10)}
              {stats.currentRating != null ? (
                <>
                  {' · '}
                  <span className="font-mono font-bold text-ink">{stats.currentRating}</span> derived rating
                </>
              ) : (
                ' · no rated games yet'
              )}
            </p>
          </div>

          {isSelf ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/import"
                className="press border-2 border-line-strong bg-surface px-4 py-2.5 text-[13px] font-bold text-ink shadow-brut-sm hover:bg-bone"
              >
                Import a PGN
              </Link>
            </div>
          ) : null}
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-px border-2 border-line bg-line sm:grid-cols-5">
          {[
            { label: 'Games', value: String(stats.games) },
            { label: 'Wins', value: String(stats.wins) },
            { label: 'Draws', value: String(stats.draws) },
            { label: 'Losses', value: String(stats.losses) },
            {
              label: 'Win rate',
              value: stats.winRate == null ? '—' : `${stats.winRate.toFixed(1)}%`,
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface px-4 py-3">
              <dt className="font-mono text-[10px] tracking-[0.1em] text-muted uppercase">{stat.label}</dt>
              <dd className="mt-1 font-mono text-[20px] tabular-nums text-ink">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-10">
          {/* ── Rating curve ───────────────────────────────────────── */}
          <section className="border-2 border-line bg-surface shadow-brut">
            <RatingCurve curve={stats.ratingCurve} />
            <div className="grid grid-cols-2 divide-x-2 divide-line">
              {(
                [
                  ['White', stats.asWhite],
                  ['Black', stats.asBlack],
                ] as const
              ).map(([label, side]) => (
                <div key={label} className="px-5 py-4">
                  <p className="text-[10px] font-bold tracking-[0.08em] text-muted uppercase">As {label}</p>
                  <p className="mt-1 font-mono text-[18px] text-ink tabular-nums">
                    {side.games > 0
                      ? `${side.wins}–${side.draws}–${side.losses} in ${side.games}`
                      : 'no games'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {side.games > 0
                      ? `${(((side.wins + side.draws * 0.5) / side.games) * 100).toFixed(0)}% score`
                      : ' '}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Openings ───────────────────────────────────────────── */}
          <section>
            <h2 className="text-[12px] font-medium tracking-[0.08em] text-muted uppercase">Openings</h2>
            {stats.openings.length === 0 ? (
              <p className="mt-3 text-[14px] text-muted">
                Nothing reached a line the reference table can name yet.
              </p>
            ) : (
              <ul className="mt-4 divide-y-2 divide-line border-2 border-line bg-surface shadow-brut">
                {stats.openings.slice(0, 6).map((opening) => (
                  <li key={opening.opening} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <span className="text-[14px] text-ink">
                      <Link href={`/players/${user.username}/games?opening=${encodeURIComponent(opening.opening)}`} className="hover:underline">
                        {opening.opening}
                      </Link>
                    </span>
                    <span className="font-mono text-[12px] text-muted">
                      {opening.games} played · {opening.wins}–{opening.draws}–{opening.losses}
                      {opening.games > 0
                        ? ` · ${(((opening.wins + opening.draws * 0.5) / opening.games) * 100).toFixed(0)}% score`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[12px] text-muted">
              Names come from the ECO table, matched over the recorded moves — only what it can say
              is said.
            </p>
          </section>

          {/* ── Recent games ───────────────────────────────────────── */}
          <section>
            <div className="flex items-end justify-between gap-4">
              <h2 className="text-[12px] font-medium tracking-[0.08em] text-muted uppercase">Recent games</h2>
              {history.total > recent.length ? (
                <Link
                  href={`/players/${user.username}/games`}
                  className="text-[13px] text-muted hover:text-ink"
                >
                  All {history.total} games →
                </Link>
              ) : null}
            </div>

            {recent.length === 0 ? (
              <p className="mt-3 text-[14px] text-muted">No finished games yet.</p>
            ) : (
              <ul className="mt-4 divide-y-2 divide-line overflow-hidden rounded-none border-2 border-line bg-surface shadow-brut">
                {recent.map((game) => {
                  const playedWhite = game.white_player_id === game.our_player_id;
                  const outcome = outcomeOf(game.result, playedWhite);
                  return (
                    <li key={game.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                      <span className={`badge flex-none border-0 ${outcome ? BADGE_STYLE[outcome] : 'bg-bone text-muted'}`}>
                        {outcome ? OUTCOME_LABEL[outcome] : '?'}
                      </span>
                      <span className="text-[14px] text-ink">
                        as <span className="font-bold">{playedWhite ? 'White' : 'Black'}</span> vs{' '}
                        {game.their_user_id ? (
                          <Link
                            href={`/players/${encodeURIComponent(game.their_name)}`}
                            className="hover:underline"
                          >
                            {game.their_name}
                          </Link>
                        ) : (
                          game.their_name
                        )}
                      </span>
                      <span className="flex-1" aria-hidden="true" />
                      <span className="font-mono text-[11px] text-muted">
                        {new Date(game.updated_at).toISOString().slice(0, 10)}
                      </span>
                      {game.opening ? (
                        <span className="font-mono text-[11px] text-muted">{game.opening}</span>
                      ) : null}
                      <Link
                        href={`/games/${game.id}/analysis`}
                        className="press flex-none border-2 border-line-strong px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone"
                      >
                        Analyse
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* ── Aside: challenges, live boards, time control ─────────── */}
        <aside className="space-y-6">
          <ChallengeBoard
            viewer={viewer?.id ?? null}
            incoming={boardIncoming as ChallengeRow[]}
            outgoing={boardOutgoing as ChallengeRow[]}
            challengeable={isSelf ? null : user.username}
          />

          {activeGames.length > 0 ? (
            <section className="border-2 border-line bg-surface shadow-brut">
              <header className="border-b-2 border-line px-5 py-3">
                <h2 className="text-[13px] font-semibold text-ink">Your boards</h2>
              </header>
              <ul className="divide-y-2 divide-line">
                {activeGames.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <Link href={`/games/${id}`} className="text-[13px] text-ink hover:underline">
                      Board #{id} — still in play
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="overflow-hidden border-2 border-line bg-surface shadow-brut">
            <header className="border-b-2 border-line px-5 py-3">
              <h2 className="text-[13px] font-semibold text-ink">Time controls</h2>
            </header>
            {stats.byTimeControl.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted">No games yet.</p>
            ) : (
              <ul className="divide-y-2 divide-line">
                {stats.byTimeControl.slice(0, 5).map((control) => (
                  <li key={control.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <Link
                      href={`/players/${user.username}/games?timeControl=${encodeURIComponent(control.id)}`}
                      className="text-[13px] text-ink hover:underline"
                    >
                      {controlLabel(control.id)}
                    </Link>
                    <span className="font-mono text-[11px] text-muted">
                      {control.games} games · {control.wins}–{control.draws}–{control.losses}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
