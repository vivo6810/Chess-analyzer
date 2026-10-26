import { NextResponse } from 'next/server';

type ChessComPlayer = {
  username?: string;
  name?: string;
  avatar?: string;
  joined?: number;
  last_online?: number;
  chess_bullet?: { last?: { rating?: number } };
  chess_blitz?: { last?: { rating?: number } };
  chess_rapid?: { last?: { rating?: number } };
  chess_daily?: { last?: { rating?: number } };
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

async function fetchJson<T>(url: string): Promise<{ response: Response; data: T | null }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    next: { revalidate: 300 },
  });
  if (!response.ok) return { response, data: null };
  return { response, data: await response.json() as T };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username: rawUsername } = await params;
  if (!/^[A-Za-z][A-Za-z0-9_-]{1,31}$/.test(rawUsername)) {
    return NextResponse.json({ error: 'Enter a valid Chess.com username.' }, { status: 400 });
  }
  const username = rawUsername.toLowerCase();
  const query = new URL(request.url).searchParams;
  const limit = Math.max(1, Math.min(100, Number(query.get('limit')) || 60));
  const months = Math.max(1, Math.min(6, Number(query.get('months')) || 2));

  try {
    const profileResult = await fetchJson<ChessComPlayer>(`https://api.chess.com/pub/player/${username}`);
    if (profileResult.response.status === 404) {
      return NextResponse.json({ error: `No profile named "${username}" on Chess.com.` }, { status: 404 });
    }
    if (!profileResult.response.ok || !profileResult.data) {
      return NextResponse.json({ error: 'Chess.com was unreachable just now.' }, { status: 502 });
    }

    const statsResult = await fetchJson<ChessComStats>(`https://api.chess.com/pub/player/${username}/stats`);
    if (!statsResult.response.ok && statsResult.response.status !== 404) {
      return NextResponse.json({ error: 'Chess.com was unreachable just now.' }, { status: 502 });
    }
    const archiveResult = await fetchJson<{ archives?: string[] }>(
      `https://api.chess.com/pub/player/${username}/games/archives`,
    );
    if (!archiveResult.response.ok || !archiveResult.data) {
      return NextResponse.json({ error: 'Chess.com was unreachable just now.' }, { status: 502 });
    }

    const archives = [...(archiveResult.data.archives ?? [])].reverse().slice(0, months);
    const cutoff = Date.now() / 1000 - months * 31 * 24 * 60 * 60;
    const games: Array<ChessComGame & { result: string }> = [];
    for (const archive of archives) {
      const result = await fetchJson<{ games?: ChessComGame[] }>(archive);
      if (!result.response.ok || !result.data) {
        return NextResponse.json({ error: 'Chess.com was unreachable just now.' }, { status: 502 });
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
        if (games.length >= limit) break;
      }
      if (games.length >= limit) break;
    }
    games.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));

    return NextResponse.json({
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
      },
      games: games.slice(0, limit),
    });
  } catch (error) {
    console.error('Chess.com proxy request failed:', error);
    return NextResponse.json({ error: 'Chess.com was unreachable just now.' }, { status: 502 });
  }
}
