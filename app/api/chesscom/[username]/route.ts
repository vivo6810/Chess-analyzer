import { NextResponse } from 'next/server';

type ChessComPlayer = {
  username?: string;
  name?: string;
  avatar?: string;
  joined?: number;
  last_online?: number;
  chess_bullet?: ChessComRating;
  chess_blitz?: ChessComRating;
  chess_rapid?: ChessComRating;
  chess_daily?: ChessComRating;
};

type ChessComRating = {
  last?: { rating?: number };
  best?: { rating?: number };
};

type ChessComStats = Pick<ChessComPlayer, 'chess_bullet' | 'chess_blitz' | 'chess_rapid' | 'chess_daily'>;

type ChessComGame = {
  rules?: string;
  end_time?: number;
  time_class?: string;
  time_control?: string;
  rated?: boolean;
  pgn?: string;
  white?: { username?: string; rating?: number; result?: string };
  black?: { username?: string; rating?: number; result?: string };
};

const USER_AGENT = 'Arbiter Analysis Site (github.com/vivo6810/Chess-analyzer)';
const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timeforfeit']);

/* A stuck upstream call must not pin a serverless instance for the full
   platform timeout: bounding each request is what keeps p99 latency and
   function duration (the bill) sane when several users probe the same slow
   endpoint at once. */
const UPSTREAM_TIMEOUT_MS = 10_000;

async function fetchOnce<T>(url: string): Promise<{ response: Response; data: T | null }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    next: { revalidate: 300 },
  });
  if (!response.ok) return { response, data: null };
  return { response, data: await response.json() as T };
}

/* One fast retry for throttles and upstream blips, only for those. A 404 or
   any other 4xx is an answer, not a flap — re-asking an answer wastes a
   rate-limit window (the one thing chess.com does track about us). */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function fetchJson<T>(url: string): Promise<{ response: Response; data: T | null }> {
  try {
    const first = await fetchOnce<T>(url);
    if (first.response.ok || !RETRYABLE_STATUS.has(first.response.status)) {
      return first;
    }
  } catch {
    /* A timeout or refusal to connect falls through to the single retry;
       if the retry also fails, the route's outer catch maps it to a 502. */
  }
  /* The wait stays short on purpose: chess.com blips are seconds long, and
     the `all` report issues this once per month archive, so a longer backoff
     would multiply into the report's whole wall clock. */
  await new Promise((resolve) => setTimeout(resolve, 500));
  return fetchOnce<T>(url);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  /* Successful payloads are the same public data for every visitor, which
     makes them ideal CDN material: under load, one origin walk per username
     per period serves everyone else from the edge (`stale-while-revalidate`
     keeps serving the previous copy while a fresh one is being pulled).
     Errors are deliberately uncached — a transient 502 must not outlive the
     blip that caused it in any layer. */
  const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

  const { username: rawUsername } = await params;
  if (!/^[A-Za-z][A-Za-z0-9_-]{1,31}$/.test(rawUsername)) {
    return NextResponse.json({ error: 'Enter a valid Chess.com username.' }, { status: 400, ...NO_STORE });
  }
  const username = rawUsername.toLowerCase();
  const query = new URL(request.url).searchParams;
  const requestedLimit = query.get('limit') ?? '60';
  const allGames = requestedLimit.toLowerCase() === 'all';
  const numericLimit = Number(requestedLimit);
  if (!allGames && (!Number.isSafeInteger(numericLimit) || numericLimit < 1)) {
    return NextResponse.json({ error: 'Choose a positive game count or "all".' }, { status: 400, ...NO_STORE });
  }
  const limit = allGames ? Number.POSITIVE_INFINITY : numericLimit;
  const allMonths = query.get('months')?.toLowerCase() === 'all';
  const months = Math.max(1, Math.min(6, Number(query.get('months')) || 2));

  try {
    const profileResult = await fetchJson<ChessComPlayer>(`https://api.chess.com/pub/player/${username}`);
    if (profileResult.response.status === 404) {
      return NextResponse.json({ error: `No profile named "${username}" on Chess.com.` }, { status: 404, ...NO_STORE });
    }
    if (!profileResult.response.ok || !profileResult.data) {
      return NextResponse.json({ error: 'Chess.com was unreachable just now.' }, { status: 502, ...NO_STORE });
    }

    const statsResult = await fetchJson<ChessComStats>(`https://api.chess.com/pub/player/${username}/stats`);
    if (!statsResult.response.ok && statsResult.response.status !== 404) {
      return NextResponse.json({ error: 'Chess.com was unreachable just now.' }, { status: 502, ...NO_STORE });
    }
    const archiveResult = await fetchJson<{ archives?: string[] }>(
      `https://api.chess.com/pub/player/${username}/games/archives`,
    );
    if (!archiveResult.response.ok || !archiveResult.data) {
      return NextResponse.json({ error: 'Chess.com was unreachable just now.' }, { status: 502, ...NO_STORE });
    }

    const allArchives = [...(archiveResult.data.archives ?? [])].reverse();
    const archives = allMonths ? allArchives : allArchives.slice(0, months);
    const cutoff = allMonths ? 0 : Date.now() / 1000 - months * 31 * 24 * 60 * 60;
    const games: Array<ChessComGame & { result: string }> = [];

    /* Month archives used to be walked strictly one at a time, which made an
       `all` report take one serial round trip per year of history. Batches
       of four keep the latency roughly quartered while staying small enough
       that chess.com's rate limiting still sees us as one well-behaved
       client. Promise.all preserves batch order, so games still come out
       newest-first across the whole walk. */
    const ARCHIVE_CONCURRENCY = 4;
    let collecting = true;
    for (let start = 0; start < archives.length && collecting; start += ARCHIVE_CONCURRENCY) {
      const batch = archives.slice(start, start + ARCHIVE_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((archive) => fetchJson<{ games?: ChessComGame[] }>(archive)),
      );
      for (const result of batchResults) {
        if (!result.response.ok || !result.data) {
          return NextResponse.json({ error: 'Chess.com was unreachable just now.' }, { status: 502, ...NO_STORE });
        }
        const archiveGames = result.data.games ?? [];
        for (let index = archiveGames.length - 1; index >= 0; index -= 1) {
          const game = archiveGames[index];
          if (game.rules && game.rules !== 'chess') continue;
          if (typeof game.end_time === 'number' && game.end_time < cutoff) continue;
          const whiteResult = game.white?.result ?? '';
          const blackResult = game.black?.result ?? '';
          const draw = DRAW_RESULTS.has(whiteResult) || DRAW_RESULTS.has(blackResult);
          const outcome = whiteResult === 'win' ? '1-0' : blackResult === 'win' ? '0-1' : draw ? '1/2-1/2' : '*';
          games.push({ ...game, result: outcome });
          if (games.length >= limit) {
            /* Finish the whole archive batch before stopping: the parallel
               requests are already in flight, and their data is simply not
               used rather than awaited serially. */
            collecting = false;
            break;
          }
        }
        if (!collecting) break;
      }
    }
    games.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));

    const payload = NextResponse.json({
      profile: {
        username: profileResult.data.username ?? username,
        name: profileResult.data.name ?? profileResult.data.username ?? username,
        avatar: profileResult.data.avatar ?? null,
        joined: profileResult.data.joined ?? null,
        last_online: profileResult.data.last_online ?? null,
        ratings: {
          bullet: statsResult.data?.chess_bullet?.last?.rating ?? profileResult.data.chess_bullet?.last?.rating ?? null,
          blitz: statsResult.data?.chess_blitz?.last?.rating ?? profileResult.data.chess_blitz?.last?.rating ?? null,
          rapid: statsResult.data?.chess_rapid?.last?.rating ?? profileResult.data.chess_rapid?.last?.rating ?? null,
          daily: statsResult.data?.chess_daily?.last?.rating ?? profileResult.data.chess_daily?.last?.rating ?? null,
        },
        bestRatings: {
          bullet: statsResult.data?.chess_bullet?.best?.rating ?? profileResult.data.chess_bullet?.best?.rating ?? null,
          blitz: statsResult.data?.chess_blitz?.best?.rating ?? profileResult.data.chess_blitz?.best?.rating ?? null,
          rapid: statsResult.data?.chess_rapid?.best?.rating ?? profileResult.data.chess_rapid?.best?.rating ?? null,
          daily: statsResult.data?.chess_daily?.best?.rating ?? profileResult.data.chess_daily?.best?.rating ?? null,
        },
      },
      games: games.slice(0, limit),
    });
    payload.headers.set(
      'Cache-Control',
      /* Short fresh window, long stale window: a profile is never wrong
         for longer than one refresh interval, yet a burst of traffic for
         the same player pays one archive walk instead of one per visitor. */
      'public, max-age=300, s-maxage=300, stale-while-revalidate=172800',
    );
    return payload;
  } catch (error) {
    console.error('Chess.com proxy request failed:', error);
    return NextResponse.json({ error: 'Chess.com was unreachable just now.' }, { status: 502, ...NO_STORE });
  }
}
