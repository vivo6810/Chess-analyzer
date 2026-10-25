import { normalizeUsername } from './auth';
import { db, now, type ChallengeRow } from './db';
import { createTournament, ServiceError, startTournament } from './service';
import { isTimeControlId } from './time-controls';

/**
 * Challenges.
 *
 * With administration gone, a game needs a door that does not keep one. A
 * challenge is the smallest honest door: one account names another, the other
 * accepts, and the existing pairing machinery makes the board — a single
 * round-robin with two players is exactly one game, so `startTournament`
 * remains the only thing that can create a game row, unchanged.
 */

export type ChallengeView = {
  id: number;
  time_control: string;
  created_at: number;
  challenger_id: number;
  opponent_id: number;
  challenger_name: string;
  opponent_name: string;
  status: ChallengeRow['status'];
  game_id: number | null;
};

type JoinedRow = ChallengeRow & { challenger_name: string; opponent_name: string };

const viewOf = (row: JoinedRow): ChallengeView => ({
  id: row.id,
  time_control: row.time_control,
  created_at: row.created_at,
  challenger_id: row.challenger_id,
  opponent_id: row.opponent_id,
  challenger_name: row.challenger_name,
  opponent_name: row.opponent_name,
  status: row.status,
  game_id: row.game_id,
});

const JOINED =
  'SELECT c.*, cu.username AS challenger_name, ou.username AS opponent_name ' +
  'FROM challenges c JOIN users cu ON cu.id = c.challenger_id JOIN users ou ON ou.id = c.opponent_id';

/** Pending challenges waiting for this user's answer, newest first. */
export function incomingChallenges(userId: number): ChallengeView[] {
  const rows = db
    .prepare(`${JOINED} WHERE c.opponent_id = ? AND c.status = 'pending' ORDER BY c.created_at DESC`)
    .all(userId) as JoinedRow[];
  return rows.map(viewOf);
}

/** A user's outgoing challenges, newest first — accepted ones include the game. */
export function outgoingChallenges(userId: number): ChallengeView[] {
  const rows = db
    .prepare(`${JOINED} WHERE c.challenger_id = ? ORDER BY c.created_at DESC LIMIT 20`)
    .all(userId) as JoinedRow[];
  return rows.map(viewOf);
}

/** The games this user is seated in and still in progress, board-ready. */
export function unfinishedGameIds(userId: number): number[] {
  const rows = db
    .prepare(
      `SELECT g.id FROM games g
       JOIN tournament_players sp ON sp.id IN (g.white_player_id, g.black_player_id)
       WHERE g.status = 'active' AND sp.user_id = ?`,
    )
    .all(userId) as { id: number }[];
  return rows.map((row) => row.id);
}

export function createChallenge(input: {
  challengerId: number;
  opponentUsername: string;
  timeControlId: string;
}): ChallengeView {
  if (!isTimeControlId(input.timeControlId)) {
    throw new ServiceError('Choose a valid time control.');
  }

  const key = normalizeUsername(input.opponentUsername);
  if (!key) throw new ServiceError('Name the player you want to challenge.');

  const opponent = db.prepare('SELECT * FROM users WHERE username_key = ?').get(key) as
    | { id: number; username: string }
    | undefined;
  if (!opponent) throw new ServiceError(`There is no player called ${input.opponentUsername.trim()}.`);
  if (opponent.id === input.challengerId) {
    throw new ServiceError('You cannot challenge yourself.');
  }
  if (isBlacklisted(opponent.id)) {
    throw new ServiceError('That account cannot accept challenges right now.');
  }

  const standing = db
    .prepare(
      `SELECT id FROM challenges
       WHERE challenger_id = ? AND opponent_id = ? AND status = 'pending'`,
    )
    .get(input.challengerId, opponent.id);
  if (standing) {
    throw new ServiceError(`Your challenge to ${opponent.username} is already standing.`);
  }

  const info = db
    .prepare(
      `INSERT INTO challenges (challenger_id, opponent_id, time_control, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)`,
    )
    .run(input.challengerId, opponent.id, input.timeControlId, now());

  return {
    id: Number(info.lastInsertRowid),
    time_control: input.timeControlId,
    created_at: now(),
    challenger_id: input.challengerId,
    opponent_id: opponent.id,
    challenger_name: '',
    opponent_name: opponent.username,
    status: 'pending',
    game_id: null,
  };
}

function isBlacklisted(userId: number): boolean {
  const row = db.prepare('SELECT blacklisted FROM users WHERE id = ?').get(userId) as
    | { blacklisted: number }
    | undefined;
  return row?.blacklisted === 1;
}

/**
 * Accepts a challenge.
 *
 * Only the challenged player may accept — the challenger cannot accept their
 * own offer, for the same reason a draw offer cannot answer itself. The game
 * is created by the untouched tournament path, which also keeps the pairing
 * rules and the clock setup in one place.
 */
export function acceptChallenge(challengeId: number, userId: number): { challenge: ChallengeView; gameId: number } {
  const row = getChallenge(challengeId);
  if (row.opponent_id !== userId) {
    throw new ServiceError('Only the challenged player can accept.');
  }
  if (row.status !== 'pending') {
    throw new ServiceError('This challenge has already been answered.');
  }

  const challenger = db
    .prepare('SELECT username FROM users WHERE id = ?')
    .get(row.challenger_id) as { username: string } | undefined;
  const opponent = db.prepare('SELECT username FROM users WHERE id = ?').get(row.opponent_id) as
    | { username: string }
    | undefined;
  if (!challenger || !opponent) throw new ServiceError('One of the two accounts no longer exists.');

  /* A two-player round robin is one game, no rounds besides the first, which
     is what makes this read as "a board" rather than "an event". */
  const created = createTournament({
    hostId: userId,
    name: `${challenger.username} vs ${opponent.username}`,
    format: 'round_robin',
    timeControlId: row.time_control,
    playerNames: [challenger.username, opponent.username],
    totalRounds: 1,
  });

  const started = startTournament(created.id);

  /* The container is half event, half receipt: it holds the two players, the
     clock and the game, but it is not a record worth listing on its own. */
  db.prepare("UPDATE tournaments SET kind = 'challenge' WHERE id = ?").run(created.id);

  const game = started && firstGameOf(started.id);
  if (!game) throw new ServiceError('The game could not be created.');

  db.prepare(
    `UPDATE challenges SET status = 'accepted', game_id = ?, answered_at = ? WHERE id = ?`,
  ).run(game, now(), row.id);

  return {
    challenge: {
      ...row,
      challenger_name: challenger.username,
      opponent_name: opponent.username,
      status: 'accepted' as const,
      game_id: game,
    },
    gameId: game,
  };
}

export function declineChallenge(challengeId: number, userId: number): void {
  const row = getChallenge(challengeId);
  if (row.opponent_id !== userId) {
    throw new ServiceError('Only the challenged player can decline.');
  }
  if (row.status !== 'pending') {
    throw new ServiceError('This challenge has already been answered.');
  }

  db.prepare(`UPDATE challenges SET status = 'declined', answered_at = ? WHERE id = ?`).run(now(), row.id);
}

function getChallenge(id: number): ChallengeRow {
  const row = db.prepare('SELECT * FROM challenges WHERE id = ?').get(id) as ChallengeRow | undefined;
  if (!row) throw new ServiceError('No such challenge.');
  return row;
}

/** Round one has exactly one pairing; the bye case cannot exist with two seats. */
function firstGameOf(tournamentId: number): number | null {
  const row = db
    .prepare('SELECT game_id FROM pairings WHERE tournament_id = ? AND round_no = 1 AND game_id IS NOT NULL')
    .get(tournamentId) as { game_id: number } | undefined;
  return row?.game_id ?? null;
}
