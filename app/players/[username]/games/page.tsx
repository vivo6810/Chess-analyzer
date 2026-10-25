import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import { findUserByUsername, gameHistory, historyOptionsFor, PER_PAGE } from '@/lib/profiles';
import { getTimeControl, TIME_CONTROLS } from '@/lib/time-controls';

export const dynamic = 'force-dynamic';

const BADGE_STYLE: Record<string, string> = {
  w: 'bg-win-bg text-win-fg',
  l: 'bg-loss-bg text-loss-fg',
  d: 'bg-draw-bg text-draw-fg',
};
const OUTCOME_LABEL = { w: 'Win', l: 'Loss', d: 'Draw' } as const;

function outcomeOf(result: string | null, playedWhite: boolean): 'w' | 'l' | 'd' | null {
  if (result === '1/2-1/2') return 'd';
  if (result === '1-0') return playedWhite ? 'w' : 'l';
  if (result === '0-1') return playedWhite ? 'l' : 'w';
  return null;
}

type Query = Record<string, string | string[] | undefined>;

const one = (query: Query, key: string): string => {
  const raw = query[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value : '';
};

/** Filters the server-side layer understands, sanitised out of the query. */
function filtersFrom(query: Query) {
  const result = one(query, 'result');
  const color = one(query, 'color');
  return {
    result: ['w', 'l', 'd'].includes(result) ? result : undefined,
    color: (['w', 'b'].includes(color) ? color : undefined) as 'w' | 'b' | undefined,
    opponent: one(query, 'opponent') || undefined,
    opening: one(query, 'opening') || undefined,
    timeControl: TIMEOUTS.includes(one(query, 'timeControl')) ? one(query, 'timeControl') : undefined,
    from: DATE.test(one(query, 'from')) ? one(query, 'from') : undefined,
    to: DATE.test(one(query, 'to')) ? one(query, 'to') : undefined,
    page: Math.max(1, Number.parseInt(one(query, 'page'), 10) || 1),
  };
}

const TIMEOUTS = TIME_CONTROLS.map((control) => control.id);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function historyUrl(
  username: string,
  filters: Record<string, string | number | undefined>,
  page?: number,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value != null && value !== '' && value !== 'any' && key !== 'page') {
      params.set(key, String(value));
    }
  }
  if (page && page > 1) params.set('page', String(page));
  const search = params.toString();
  return `/players/${encodeURIComponent(username)}/games${search ? `?${search}` : ''}`;
}

export default async function GameHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<Query>;
}) {
  const { username } = await params;
  const user = findUserByUsername(decodeURIComponent(username));
  if (!user) notFound();

  const query = await searchParams;
  const filters = filtersFrom(query);
  const { games, total } = gameHistory(user.id, filters);
  const options = historyOptionsFor(user.id);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const rowStyle = (game: (typeof games)[number]) => {
    const playedWhite = game.white_player_id === game.our_player_id;
    return { outcome: outcomeOf(game.result, playedWhite), playedWhite };
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="border-b-2 border-line pb-6">
        <p className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
          <Link href={`/players/${encodeURIComponent(user.username)}`} className="hover:text-ink">
            {user.username}
          </Link>{' '}
          · games
        </p>
        <h1 className="mt-2 font-extrabold text-[clamp(1.8rem,4vw,2.5rem)] leading-[1.06] tracking-[-0.035em] text-ink">
          Game history
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          {total} finished game{total === 1 ? '' : 's'} on record.
        </p>
      </header>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <form action={`/players/${encodeURIComponent(user.username)}/games`} method="get" className="mt-6 grid gap-3 border-2 border-line bg-surface p-4 shadow-brut-sm sm:grid-cols-2 lg:grid-cols-5">
        <label className="block">
          <span className="field-label">Result</span>
          <select name="result" defaultValue={filters.result ?? 'any'} className="field mt-1.5">
            <option value="any">Any</option>
            <option value="w">Wins</option>
            <option value="l">Losses</option>
            <option value="d">Draws</option>
          </select>
        </label>

        <label className="block">
          <span className="field-label">Colour</span>
          <select name="color" defaultValue={filters.color ?? 'any'} className="field mt-1.5">
            <option value="any">Either</option>
            <option value="w">As White</option>
            <option value="b">As Black</option>
          </select>
        </label>

        <label className="block">
          <span className="field-label">Opening</span>
          <select name="opening" defaultValue={filters.opening ?? 'any'} className="field mt-1.5">
            <option value="any">Any</option>
            {options.openings.map((opening) => (
              <option key={opening} value={opening}>
                {opening}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="field-label">Time control</span>
          <select name="timeControl" defaultValue={filters.timeControl ?? 'any'} className="field mt-1.5">
            <option value="any">Any</option>
            {options.timeControls.map((control) => (
              <option key={control} value={control}>
                {TIME_CONTROLS.find((item) => item.id === control)?.label ?? control}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2 lg:col-span-1">
          <label className="block">
            <span className="field-label">From</span>
            <input type="date" name="from" defaultValue={filters.from ?? ''} className="field mt-1.5" />
          </label>
          <label className="block">
            <span className="field-label">To</span>
            <input type="date" name="to" defaultValue={filters.to ?? ''} className="field mt-1.5" />
          </label>
        </div>

        <label className="block sm:col-span-2">
          <span className="field-label">Opponent</span>
          <input name="opponent" defaultValue={filters.opponent ?? ''} placeholder="Name contains…" className="field mt-1.5" />
        </label>

        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="press border-2 border-ink bg-accent px-5 py-2.5 text-[13px] font-bold text-on-accent shadow-brut-sm">
            Apply
          </button>
          <Link href={`/players/${encodeURIComponent(user.username)}/games`} className="press border-2 border-line-strong px-4 py-2.5 text-[13px] font-medium text-ink hover:bg-bone">
            Clear
          </Link>
        </div>
      </form>

      {/* ── The list ───────────────────────────────────────────────── */}
      {games.length === 0 ? (
        <div className="mt-8 border-2 border-ink bg-surface px-5 py-4 text-[14px] text-muted shadow-brut">
          No games match these filters.
        </div>
      ) : (
        <ul className="mt-8 divide-y-2 divide-line overflow-hidden border-2 border-line bg-surface">
          {games.map((game) => {
            const { outcome, playedWhite } = rowStyle(game);
            return (
              <li key={game.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
                <span className={`badge flex-none border-0 ${outcome ? BADGE_STYLE[outcome] : 'bg-bone text-muted'}`}>
                  {outcome ? OUTCOME_LABEL[outcome] : '?'}
                </span>
                <span className="text-[13px] text-ink sm:text-[14px]">
                  as <span className="font-bold">{playedWhite ? 'W' : 'B'}</span> vs{' '}
                  {game.their_user_id ? (
                    <Link href={`/players/${encodeURIComponent(game.their_name)}`} className="hover:underline">
                      {game.their_name}
                    </Link>
                  ) : (
                    game.their_name
                  )}
                </span>
                <span className="font-mono text-[11px] text-muted">{getTimeControl(game.time_control).label}</span>
                {game.opening ? <span className="font-mono text-[11px] text-muted">{game.opening}</span> : null}
                <span className="font-mono text-[11px] text-muted">{game.move_count} moves</span>
                <span className="flex-1" aria-hidden="true" />
                <span className="font-mono text-[11px] text-muted">
                  {new Date(game.updated_at).toISOString().slice(0, 10)}
                </span>
                <Link
                  href={`/games/${game.id}/analysis`}
                  className="press flex-none border-2 border-line-strong px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone"
                >
                  Open analysis
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="mt-6 flex items-center justify-between" aria-label="Pages">
          {filters.page > 1 ? (
            <Link href={historyUrl(user.username, filters, filters.page - 1)} className="press border-2 border-line-strong px-4 py-2 text-[13px] font-medium text-ink hover:bg-bone">
              ← Newer
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          <span className="font-mono text-[12px] text-muted">
            page {filters.page} of {pages}
          </span>
          {filters.page < pages ? (
            <Link href={historyUrl(user.username, filters, filters.page + 1)} className="press border-2 border-line-strong px-4 py-2 text-[13px] font-medium text-ink hover:bg-bone">
              Older →
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
        </nav>
      ) : null}
    </div>
  );
}
