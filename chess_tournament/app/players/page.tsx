import Link from 'next/link';

import { allRatedGames, playerDirectory } from '@/lib/profiles';
import { ratingCurvesFromGames, currentRatingFrom } from '@/lib/rating';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Players — Arbiter' };

/**
 * The directory.
 *
 * Ratings on this page are the same derived curves the profiles use — one walk
 * over the site's finished games per request — because a directory that showed
 * the idle default of 1200 for everyone would be lying twice: first about the
 * number, then about what it means.
 */
export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  const rows = playerDirectory(query, false);

  /* A shared walk keeps the directory's ratings identical to the profiles'. */
  const curves = ratingCurvesFromGames(allRatedGames());
  const ratingOf = (id: number) => currentRatingFrom(curves, id)?.rating ?? null;

  /* Played comes before registered: the order is a record, not a sign-up sheet. */
  const ranked = [...rows].sort(
    (a, b) =>
      b.games - a.games ||
      b.wins - a.wins ||
      a.username.localeCompare(b.username),
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <header className="max-w-2xl">
        <h1 className="font-extrabold text-[36px] leading-[1.12] tracking-[-0.03em] text-ink">Players</h1>
        <p className="mt-3 text-[15px] text-muted">
          Everyone with an account here, with the record their games actually built. Ratings are
          derived from results, game by game.
        </p>
      </header>

      <form action="/players" method="get" className="mt-8 flex max-w-md gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search players"
          aria-label="Search players"
          className="field"
        />
        <button type="submit" className="press flex-none border-2 border-ink bg-accent px-4 py-2 text-[13px] font-bold text-on-accent shadow-brut-sm">
          Search
        </button>
      </form>

      {ranked.length === 0 ? (
        <div className="mt-12 rounded-none border-2 border-line bg-surface shadow-brut px-7 py-10">
          <p className="text-[15px] text-ink">No players found.</p>
          <p className="mt-1.5 text-[14px] text-muted">
            {query ? `Nothing matches “${query}”.` : 'The first account to arrive is the first name here.'}
          </p>
        </div>
      ) : (
        <div className="mt-12 overflow-hidden rounded-none border-2 border-line">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b-2 border-line bg-surface-sunken text-[11px] tracking-[0.06em] text-muted uppercase">
                <th className="px-4 py-2.5 text-left font-medium">Player</th>
                <th className="px-4 py-2.5 text-right font-medium">Rating</th>
                <th className="px-4 py-2.5 text-right font-medium">Pld</th>
                <th className="px-4 py-2.5 text-right font-medium">W</th>
                <th className="px-4 py-2.5 text-right font-medium">D</th>
                <th className="px-4 py-2.5 text-right font-medium">L</th>
              </tr>
            </thead>
            <tbody className="bg-surface">
              {ranked.map((row) => (
                <tr key={row.id} className="border-b-2 border-line last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/players/${encodeURIComponent(row.username)}`} className="text-ink hover:underline">
                      {row.username}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink">
                    {ratingOf(row.id) ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted">{row.games}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted">{row.wins}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted">{row.draws}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted">{row.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
