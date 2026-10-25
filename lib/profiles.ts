import { db, parseMoves, type UserRow } from './db';
import { ratingCurvesFromGames, type RatingPoint } from './rating';
import { getTimeControl } from './time-controls';

/**
 * The read side of a profile.
 *
 * Everything a profile page needs is derived here from the same rows the board
 * and the records pages read. Games keep their seats on `tournament_players`,
 * so a player's record is a join on the seat that carries their user id — the
 * one fact an account and a game share.
 */

export type FinishedGameRow = {
  id: number;
  result: string | null;
  termination: string | null;
  opening: string | null;
  time_control: string;
  source: 'tournament' | 'import';
  updated_at: number;
  /** Whose seat we joined on; the colour is which seat id matches. */
  our_player_id: number;
  white_player_id: number;
  their_name: string;
  their_user_id: number | null;
};

export type GameListRow = FinishedGameRow & { move_count: number };

export type HistoryFilters = {
  /** 'w' won, 'l' lost, 'd' drew, 'any' everything. */
  result?: string;
  color?: 'w' | 'b';
  /** Opponent name filter (case-insensitive substring). */
  opponent?: string;
  opening?: string;
  timeControl?: string;
  /** Inclusive bounds, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  page?: number;
};

export const PER_PAGE = 20;

const esc = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/** A `YYYY-MM-DD` bound as an epoch-ms edge, both dates read as UTC. */
const dayEdge = (value: string, end: boolean): number | null => {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  return end ? parsed + 24 * 3_600_000 - 1 : parsed;
};

const HISTORY_FROM = `
  FROM games g
  JOIN tournament_players my
    ON my.id IN (g.white_player_id, g.black_player_id) AND my.user_id = ?
  JOIN tournament_players op
    ON op.id = CASE WHEN g.white_player_id = my.id THEN g.black_player_id ELSE g.white_player_id END`;

/** The WHERE clause and parameters a filter set asks for. */
function historyConditions(userId: number, filters: HistoryFilters) {
  const conditions = ["g.status = 'finished'"];
  const params: (string | number)[] = [userId];

  if (filters.color === 'w') conditions.push('g.white_player_id = my.id');
  if (filters.color === 'b') conditions.push('g.black_player_id = my.id');

  /* W/L/D are the player's own outcome, so the seat decides which column of the
     result counts. With no colour filter both directions are checked. */
  if (filters.result === 'w') {
    conditions.push(
      "(g.white_player_id = my.id AND g.result = '1-0') OR (g.black_player_id = my.id AND g.result = '0-1')",
    );
  } else if (filters.result === 'l') {
    conditions.push(
      "(g.white_player_id = my.id AND g.result = '0-1') OR (g.black_player_id = my.id AND g.result = '1-0')",
    );
  } else if (filters.result === 'd') {
    conditions.push("g.result = '1/2-1/2'");
  }

  if (filters.opponent) {
    conditions.push("LOWER(op.name) LIKE ? ESCAPE '\\'");
    params.push(`%${esc(filters.opponent.toLowerCase())}%`);
  }

  if (filters.opening) {
    conditions.push('g.opening = ?');
    params.push(filters.opening);
  }

  if (filters.timeControl) {
    conditions.push('g.time_control = ?');
    params.push(filters.timeControl);
  }

  const from = filters.from ? dayEdge(filters.from, false) : null;
  if (from != null) {
    conditions.push('g.updated_at >= ?');
    params.push(from);
  }
  const to = filters.to ? dayEdge(filters.to, true) : null;
  if (to != null) {
    conditions.push('g.updated_at <= ?');
    params.push(to);
  }

  return { conditions, params };
}

function historyRows(userId: number, filters: HistoryFilters, limit?: { limit: number; offset: number }) {
  const { conditions, params } = historyConditions(userId, filters);
  const where = conditions.join(' AND ');
  const paging = limit ? ` LIMIT ? OFFSET ?` : '';
  const pagingParams = limit ? [limit.limit, limit.offset] : [];

  return db
    .prepare(
      `SELECT g.id, g.result, g.termination, g.opening, g.time_control, g.source,
              g.white_player_id, g.updated_at, g.moves,
              my.id AS our_player_id, op.name AS their_name, op.user_id AS their_user_id
       ${HISTORY_FROM}
       WHERE ${where}
       ORDER BY g.updated_at DESC, g.id DESC${paging}`,
    )
    .all(...params, ...pagingParams) as unknown as (FinishedGameRow & { moves: string })[];
}

/**
 * One page of a player's finished games, newest first.
 *
 * `moves` is read once in the same query the rest of the row arrives in and
 * converted here, so listing never re-opens the database per row.
 */
export function gameHistory(userId: number, filters: HistoryFilters): { games: GameListRow[]; total: number } {
  const page = Math.max(1, filters.page ?? 1);
  const rows = historyRows(userId, filters, { limit: PER_PAGE, offset: (page - 1) * PER_PAGE });

  const { conditions, params } = historyConditions(userId, filters);
  const total = (
    db.prepare(`SELECT COUNT(*) AS n ${HISTORY_FROM} WHERE ${conditions.join(' AND ')}`).get(
      ...params,
    ) as { n: number }
  ).n;

  const games: GameListRow[] = rows.map((row) => ({
    id: row.id,
    result: row.result,
    termination: row.termination,
    opening: row.opening,
    time_control: row.time_control,
    source: row.source,
    updated_at: row.updated_at,
    our_player_id: row.our_player_id,
    white_player_id: row.white_player_id,
    their_name: row.their_name,
    their_user_id: row.their_user_id,
    move_count: parseMoves(row.moves).length,
  }));

  return { games, total };
}

/** Every finished game of a player, for the whole-profile aggregation. */
export function allFinishedGames(userId: number): GameListRow[] {
  return historyRows(userId, {}).map((row) => ({
    id: row.id,
    result: row.result,
    termination: row.termination,
    opening: row.opening,
    time_control: row.time_control,
    source: row.source,
    updated_at: row.updated_at,
    our_player_id: row.our_player_id,
    white_player_id: row.white_player_id,
    their_name: row.their_name,
    their_user_id: row.their_user_id,
    move_count: parseMoves(row.moves).length,
  }));
}

/** Every finished game, oldest first, for the site-wide rating walk. */
export function allRatedGames(): {
  whiteUserId: number | null;
  blackUserId: number | null;
  result: string | null;
  at: number;
}[] {
  const rows = db
    .prepare(
      `SELECT g.result, g.updated_at, wp.user_id AS wuid, bp.user_id AS buid
       FROM games g
       JOIN tournament_players wp ON wp.id = g.white_player_id
       JOIN tournament_players bp ON bp.id = g.black_player_id
       WHERE g.status = 'finished'
       ORDER BY g.updated_at ASC, g.id ASC`,
    )
    .all() as { result: string | null; updated_at: number; wuid: number | null; buid: number | null }[];

  /* A guest seat has no user id; the rating walker skips those games, since no
     estimate can move for a seat nobody played. */
  return rows.map((row) => ({
    whiteUserId: row.wuid,
    blackUserId: row.buid,
    result: row.result,
    at: row.updated_at,
  }));
}

export type ProfileStats = {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null;
  asWhite: { games: number; wins: number; draws: number; losses: number };
  asBlack: { games: number; wins: number; draws: number; losses: number };
  averageLength: number | null;
  /** Most played openings first; only ones the table could name. */
  openings: { opening: string; games: number; wins: number; draws: number; losses: number }[];
  byTimeControl: { id: string; games: number; wins: number; draws: number; losses: number }[];
  /** Games that actually ended, oldest first — the rating curve's raw material. */
  ratedGames: { result: string | null; at: number; whiteUserId: number | null; blackUserId: number | null }[];
  /** The player's own Elo curve, derived, oldest first. */
  ratingCurve: RatingPoint[];
  currentRating: number | null;
};

const SIDE_KEYS = ['asWhite', 'asBlack'] as const;

/**
 * The profile's numbers, from the player's real games.
 *
 * Percentages stay null until there is a record to say them about: a player
 * with no games shows zeros where zeros are true and "—" everywhere a percent
 * would otherwise be invented.
 */
export function statsFor(userId: number): ProfileStats {
  const games = allFinishedGames(userId);

  let wins = 0;
  let losses = 0;
  let draws = 0;
  let totalMoves = 0;

  const sides: Record<(typeof SIDE_KEYS)[number], { games: number; wins: number; draws: number; losses: number }> = {
    asWhite: { games: 0, wins: 0, draws: 0, losses: 0 },
    asBlack: { games: 0, wins: 0, draws: 0, losses: 0 },
  };
  const openings = new Map<string, { games: number; wins: number; draws: number; losses: number }>();
  const controls = new Map<string, { games: number; wins: number; draws: number; losses: number }>();
  const ratedGames: ProfileStats['ratedGames'] = [];

  const bucket = (map: Map<string, { games: number; wins: number; draws: number; losses: number }>, key: string, result: string | null) => {
    const entry = map.get(key) ?? { games: 0, wins: 0, draws: 0, losses: 0 };
    entry.games += 1;
    if (result === '1-0') entry.wins += 1;
    else if (result === '0-1') entry.losses += 1;
    else if (result === '1/2-1/2') entry.draws += 1;
    map.set(key, entry);
  };

  for (const game of games) {
    const playedWhite = game.white_player_id === game.our_player_id;
    const side = playedWhite ? sides.asWhite : sides.asBlack;
    side.games += 1;
    if (game.result === '1-0') {
      if (playedWhite) side.wins += 1;
      else side.losses += 1;
    } else if (game.result === '0-1') {
      if (playedWhite) side.losses += 1;
      else side.wins += 1;
    } else if (game.result === '1/2-1/2') {
      side.draws += 1;
    }

    /* The player's own outcome, independent of the seat: fills the headline. */
    const outcome = playedWhite
      ? game.result
      : game.result === '1-0'
        ? '0-1'
        : game.result === '0-1'
          ? '1-0'
          : game.result;
    if (outcome === '1-0') wins += 1;
    else if (outcome === '0-1') losses += 1;
    else if (outcome === '1/2-1/2') draws += 1;

    totalMoves += game.move_count;

    if (game.opening) bucket(openings, game.opening, outcome);
    bucket(controls, game.time_control, outcome);

    ratedGames.push({
      result: game.result,
      at: game.updated_at,
      whiteUserId: playedWhite ? userId : null,
      blackUserId: playedWhite ? null : userId,
    });
  }

  /* Both seats need accounts for a game to move a rating. Our own curve is
     exactly the shared-walk result restricted to this user. */
  const curves = ratingCurvesFromGames(ratedGames);
  const ratingCurve = curves.get(userId) ?? [];
  const currentRating = ratingCurve.length ? ratingCurve[ratingCurve.length - 1].rating : null;

  const played = games.length;

  return {
    games: played,
    wins,
    losses,
    draws,
    winRate: played ? (wins / played) * 100 : null,
    asWhite: sides.asWhite,
    asBlack: sides.asBlack,
    averageLength: played ? totalMoves / played : null,
    openings: [...openings.entries()]
      .map(([opening, entry]) => ({ opening, ...entry }))
      .sort((a, b) => b.games - a.games || a.opening.localeCompare(b.opening)),
    byTimeControl: [...controls.entries()]
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => b.games - a.games),
    ratedGames,
    ratingCurve,
    currentRating,
  };
}

export type HistoryOptions = { openings: string[]; timeControls: string[] };

/**
 * The filter dropdowns a history page offers. Distinct over this player's own
 * rows: an opening they never played is not an option on their page.
 */
export function historyOptionsFor(userId: number): HistoryOptions {
  const rows = db
    .prepare(
      `SELECT DISTINCT g.opening, g.time_control
       FROM games g
       JOIN tournament_players sp ON sp.id IN (g.white_player_id, g.black_player_id)
       WHERE g.status = 'finished' AND sp.user_id = ?
       ORDER BY g.time_control, g.opening`,
    )
    .all(userId) as { opening: string | null; time_control: string }[];

  const openings = new Set<string>();
  const controls = new Set<string>();
  for (const row of rows) {
    controls.add(row.time_control);
    if (row.opening) openings.add(row.opening);
  }

  return {
    openings: [...openings].sort((a, b) => a.localeCompare(b)),
    timeControls: [...controls].sort(
      (a, b) => getTimeControl(b).initialMs - getTimeControl(a).initialMs,
    ),
  };
}

export function findUserByUsername(username: string): UserRow | null {
  const row = db
    .prepare('SELECT * FROM users WHERE username_key = ?')
    .get(username.trim().toLowerCase()) as UserRow | undefined;
  return row ?? null;
}

export type PlayerDirectoryRow = {
  id: number;
  username: string;
  created_at: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
};

/**
 * The player directory: tallies per account via correlated counts, one row per
 * account, searched by an unsubtle substring on the username key. Accounts
 * that have finished games come first — a fresh registration is not empty,
 * it is just not interesting here yet unless the caller asks otherwise.
 */
export function playerDirectory(query: string, withGamesOnly: boolean): PlayerDirectoryRow[] {
  const seatCounts = (predicate: string): string =>
    `(SELECT COUNT(*) FROM games g JOIN tournament_players sp
         ON sp.id IN (g.white_player_id, g.black_player_id)
       WHERE g.status = 'finished' AND sp.user_id = u.id AND (${predicate}))`;

  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.created_at,
              ${seatCounts('1 = 1')} AS games,
              ${seatCounts(
                `(sp.id = g.white_player_id AND g.result = '1-0') OR (sp.id = g.black_player_id AND g.result = '0-1')`,
              )} AS wins,
              ${seatCounts("g.result = '1/2-1/2'")} AS draws,
              ${seatCounts(
                `(sp.id = g.white_player_id AND g.result = '0-1') OR (sp.id = g.black_player_id AND g.result = '1-0')`,
              )} AS losses
       FROM users u
       WHERE (? = '' OR u.username_key LIKE '%' || ? || '%')
       LIMIT 200`,
    )
    .all(query.trim().toLowerCase(), query.trim().toLowerCase()) as {
    id: number;
    username: string;
    created_at: number;
    games: number;
    wins: number;
    draws: number;
    losses: number;
  }[];

  const mapped = rows.map((row) => ({
    id: row.id,
    username: row.username,
    created_at: row.created_at,
    games: Number(row.games),
    wins: Number(row.wins),
    draws: Number(row.draws),
    losses: Number(row.losses),
  }));

  const withGames = mapped.filter((row) => row.games > 0);
  return withGamesOnly ? withGames : [...withGames, ...mapped.filter((row) => row.games === 0)];
}
