import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import Database from 'libsql';

import type { Role } from './admin.ts';
import os from 'node:os';
import path from 'node:path';

/**
 * Storage is SQLite, written against plain SQL so the domain code neither knows
 * nor cares which driver is behind `db`.
 *
 * Three ways to open it:
 * - **Local file** (default): Node's built-in `node:sqlite` at `DATABASE_PATH`.
 *   No external service, no API key, no native module.
 * - **Embedded replica** (hosted, durable): when `TURSO_DATABASE_URL` points at a
 *   remote primary, the `libsql` sync driver keeps a local file that reads from
 *   cached state and writes through to the primary. On a serverless host this
 *   is the only mode where data outlives the instance: the local cache is
 *   disposable, the primary is the record.
 * - **Direct remote**: `DATABASE_PATH` itself set to a `libsql://` URL talks to
 *   the primary with nothing cached locally.
 *
 * All three expose the small synchronous interface the service layer was
 * written against — `exec` + `prepare().get/all/run` — so no call site changed.
 */

/**
 * The driver-agnostic shape everything downstream is typed against.
 *
 * Both drivers return structurally compatible statement objects (unknown rows,
 * `lastInsertRowid` on run results), but their declared signatures point at
 * different libraries, so the app never names either type outside this file.
 */
type DbStatement = {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): { lastInsertRowid?: unknown };
};

export type DbHandle = {
  exec(sql: string): void;
  prepare(sql: string): DbStatement;
};

/**
 * Where the database file lives.
 *
 * A serverless host mounts the deployment itself read-only — the repo's
 * `data/arbiter.db` is readable but not writable, and creating a new file
 * beside it fails with "unable to open database file". The only writable
 * directory in such a runtime is the OS temp directory, so on a hosted
 * function we keep the local cache there. In replica mode that file is only
 * the replica: the data itself lives at the remote primary.
 */
function defaultDbPath(): string {
  const hosted = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (hosted) return path.join(os.tmpdir(), 'arbiter-data', 'arbiter.db');
  return path.join(process.cwd(), 'data', 'arbiter.db');
}

const DB_PATH = process.env.DATABASE_PATH ?? defaultDbPath();

/* Remote-primary settings. The URL names the Turso/libSQL primary; the token
   authenticates it. Vercel's Turso Marketplace integration sets both names. */
const TURSO_URL = process.env.TURSO_DATABASE_URL?.trim() || null;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN ?? '';

/** Seconds between background replica syncs while an instance stays warm. */
const REPLICA_SYNC_PERIOD_SECONDS = 60;

const isRemoteUrl = (location: string): boolean =>
  location.startsWith('libsql://') || location.startsWith('https://');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL,
  username_key  TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rating        INTEGER NOT NULL DEFAULT 1200,
  /* 'user' is everybody; 'admin' runs tournaments and may settle any board;
     'owner' manages the people who use the app. */
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'owner')),
  /* Kept for historical databases. Nothing in the app grants powers by role
     any more: administration lives in its own operations, not in the schema. */
  /* 1 means the owner has stopped this account signing in. Sessions are deleted
     at the same moment, so the block takes effect on the next request. */
  blacklisted   INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS tournaments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  host_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  format        TEXT NOT NULL CHECK (format IN ('swiss', 'round_robin')),
  time_control  TEXT NOT NULL,
  total_rounds  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'finished')),
  current_round INTEGER NOT NULL DEFAULT 0,
  /* A suspended event is frozen: no moves, no new round, no edits. The console
     that set it is gone; the column stays so a historical database keeps
     behaving the way its rows say. */
  suspended     INTEGER NOT NULL DEFAULT 0,
  /* Created from a retired admin test lab. Sandbox games let a staff account
     play both seats. Kept so old sandbox events stay playable. */
  sandbox       INTEGER NOT NULL DEFAULT 0,
  /* 'event' is a played tournament record, 'challenge' is the two-seat container
     a challenge produces, and 'import' is a per-user container for games
     imported as PGN. The public lists only show events. */
  kind          TEXT NOT NULL DEFAULT 'event'
                CHECK (kind IN ('event', 'challenge', 'import')),
  created_at    INTEGER NOT NULL,
  started_at    INTEGER
);

CREATE TABLE IF NOT EXISTS tournament_players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  seed          INTEGER NOT NULL,
  withdrawn     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  UNIQUE (tournament_id, name)
);
CREATE INDEX IF NOT EXISTS idx_players_tournament ON tournament_players(tournament_id);

CREATE TABLE IF NOT EXISTS games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id   INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
  round_no        INTEGER,
  board           INTEGER,
  white_player_id INTEGER NOT NULL REFERENCES tournament_players(id) ON DELETE CASCADE,
  black_player_id INTEGER NOT NULL REFERENCES tournament_players(id) ON DELETE CASCADE,
  time_control    TEXT NOT NULL,
  fen             TEXT NOT NULL,
  /* The position the game began from. Played games always start from the
     standard position; imported PGN may carry its own SetUp/FEN tags. */
  start_fen        TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves           TEXT NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  result          TEXT,
  termination     TEXT,
  /* 'tournament' is a game from an event or a challenge; 'import' arrived as
     PGN and cannot be moved through the live board. */
  source          TEXT NOT NULL DEFAULT 'tournament' CHECK (source IN ('tournament', 'import')),
  /* ECO code + name at the point the game ended, e.g. "C50 Italian Game".
     Written on finish and on import so history filters stay pure SQL. */
  opening         TEXT,
  /* sha256 over the move list and the two names. The unique index on it is what
     keeps the same import from landing twice. */
  fingerprint     TEXT,
  white_ms        INTEGER NOT NULL,
  black_ms        INTEGER NOT NULL,
  increment_ms    INTEGER NOT NULL DEFAULT 0,
  per_move_ms     INTEGER NOT NULL DEFAULT 0,
  turn_started_at INTEGER NOT NULL,
  /* Who last offered a draw, by user id. NULL means no offer is standing.
     A draw is an agreement between the two players, so it needs a place to
     hold the half-finished agreement; the board position alone cannot. */
  draw_offer_by   INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_tournament ON games(tournament_id, round_no, board);

CREATE TABLE IF NOT EXISTS challenges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  /* The two accounts. Both are users: games only ever come from a challenge or
     an import, so there is no typed-in name involved here. */
  challenger_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time_control  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  game_id       INTEGER REFERENCES games(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  answered_at   INTEGER
);

CREATE TABLE IF NOT EXISTS pairings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_no      INTEGER NOT NULL,
  board         INTEGER NOT NULL,
  white_id      INTEGER REFERENCES tournament_players(id) ON DELETE CASCADE,
  black_id      INTEGER REFERENCES tournament_players(id) ON DELETE CASCADE,
  game_id       INTEGER REFERENCES games(id) ON DELETE SET NULL,
  result        TEXT,
  is_bye        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tournament_id, round_no, board)
);
CREATE INDEX IF NOT EXISTS idx_pairings_round ON pairings(tournament_id, round_no);
`;

/* Columns added after a database already existed. `CREATE TABLE IF NOT EXISTS`
   is a no-op there, so the schema above is not enough to migrate a running
   instance — each entry is applied only when the column is missing. */
const ADDED_COLUMNS: { table: string; column: string; definition: string }[] = [
  { table: 'games', column: 'draw_offer_by', definition: 'INTEGER' },
  { table: 'users', column: 'role', definition: "TEXT NOT NULL DEFAULT 'user'" },
  { table: 'users', column: 'blacklisted', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'tournaments', column: 'suspended', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'tournaments', column: 'sandbox', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'tournaments', column: 'kind', definition: "TEXT NOT NULL DEFAULT 'event'" },
  { table: 'games', column: 'source', definition: "TEXT NOT NULL DEFAULT 'tournament'" },
  { table: 'games', column: 'opening', definition: 'TEXT' },
  { table: 'games', column: 'fingerprint', definition: 'TEXT' },
  {
    table: 'games',
    column: 'start_fen',
    definition:
      "TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'",
  },
];

function migrate(handle: DbHandle): void {
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const columns = handle.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.length === 0) continue;
    if (columns.some((existing) => existing.name === column)) continue;
    handle.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  /* Indexes on columns this run may just have added — created here, after the
     ALTER TABLEs, because `CREATE TABLE IF NOT EXISTS` cannot add an index for
     a column a pre-existing table does not yet carry. */
  handle.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_games_fingerprint
       ON games(fingerprint) WHERE fingerprint IS NOT NULL;
     CREATE INDEX IF NOT EXISTS idx_games_finished
       ON games(status, updated_at DESC);`,
  );

  /* Events created from /lab before the sandbox flag existed are still lab
     events. The slug is what the lab generated them with, so it is the only
     evidence available; without this they would behave like real events and the
     admin could no longer drive both seats at their boards. */
  handle
    .prepare("UPDATE tournaments SET sandbox = 1 WHERE sandbox = 0 AND slug LIKE 'lab-%'")
    .run();
}

/** Runs the schema, then migrations, on any handle. */
function withSchema(handle: DbHandle): void {
  handle.exec(SCHEMA);
  migrate(handle);
}

/**
 * libsql rows carry an undocumented `_metadata` timing record. The service
 * layer serialises whole row objects into JSON responses, so it is stripped at
 * the boundary — no caller should see driver internals.
 */
function stripDriverMetadata<T>(row: T): T {
  if (row && typeof row === 'object' && '_metadata' in row) {
    delete (row as { _metadata?: unknown })._metadata;
  }
  return row;
}

/**
 * Wraps a driver behind the app's small synchronous interface.
 *
 * The declared statement signatures of `node:sqlite` and `libsql` differ in
 * parameter typing even where the behaviour is identical, so the cast lives
 * here, once, rather than at every call site.
 */
function adapter(handle: { exec(sql: string): unknown; prepare(sql: string): unknown }): DbHandle {
  const driver = handle as unknown as {
    exec(sql: string): void;
    prepare(sql: string): {
      get(...args: unknown[]): unknown;
      all(...args: unknown[]): unknown[];
      run(...args: unknown[]): { lastInsertRowid?: number | bigint };
    };
  };

  return {
    exec: (sql) => driver.exec(sql),
    prepare: (sql) => {
      const statement = driver.prepare(sql);
      return {
        get: (...args) => stripDriverMetadata(statement.get(...args)),
        all: (...args) =>
          (statement.all(...args) as unknown[]).map((row) => stripDriverMetadata(row)),
        run: (...args) => statement.run(...args),
      };
    },
  };
}

function openAt(file: string): DbHandle {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const handle = new DatabaseSync(file);
  handle.exec('PRAGMA journal_mode = WAL;');
  handle.exec('PRAGMA foreign_keys = ON;');
  /* Two concurrent requests on the same instance can reach the file at once.
     Waiting for the lock beats failing the request. */
  handle.exec('PRAGMA busy_timeout = 5000;');
  const wrapped = adapter(handle);
  withSchema(wrapped);
  return wrapped;
}

/**
 * Local libSQL file — or, when `DATABASE_PATH` itself is a remote URL, a direct
 * remote connection. Pragmas that describe a local file are skipped for the
 * remote form: the primary manages its own journaling and concurrency.
 */
function openLibsql(location: string): DbHandle {
  if (isRemoteUrl(location)) {
    const handle = adapter(
      new Database(location, { authToken: TURSO_TOKEN } as unknown as Database.Options),
    );
    withSchema(handle);
    return handle;
  }

  const handle = adapter(
    new Database(location, { timeout: 5000, authToken: TURSO_TOKEN } as unknown as Database.Options),
  );
  handle.exec('PRAGMA foreign_keys = ON;');
  handle.exec('PRAGMA busy_timeout = 5000;');
  handle.exec('PRAGMA journal_mode = WAL;');
  withSchema(handle);
  return handle;
}

/**
 * An embedded replica of a remote primary.
 *
 * The initial sync runs inside `open` so a cold instance starts from the
 * primary's state rather than from an empty file, and replicas re-sync on a
 * timer (plus `readYourWrites`, the default, which is what keeps an instance's
 * own moves visible to itself). The periodic sync is what eventual cross-
 * instance consistency rides on: the same replica is written locally here and
 * captured remotely, so an instance that stays warm sends its own writes to
 * the primary without ever diverging.
 */
function openReplica(localFile: string): DbHandle {
  mkdirSync(path.dirname(localFile), { recursive: true });
  /* The typed options end at `syncUrl`; the remaining ones (authToken,
     syncPeriod) exist at runtime but the libsql typings do not carry them. */
  const handle = adapter(
    new Database(localFile, {
      syncUrl: TURSO_URL!,
      authToken: TURSO_TOKEN,
      syncPeriod: REPLICA_SYNC_PERIOD_SECONDS,
    } as unknown as NonNullable<ConstructorParameters<typeof Database>[1]>),
  );
  handle.exec('PRAGMA foreign_keys = ON;');
  withSchema(handle);
  return handle;
}

/**
 * Opening is the step that can fail — a read-only host, a bad token, an
 * unreachable primary. Falling back to an in-memory database keeps the app
 * rendering instead of turning every data-backed page into a 500, so a
 * misconfigured deployment degrades to empty pages that still work rather than
 * to an error screen.
 */
function open(): DbHandle {
  if (DB_PATH === ':memory:' && !TURSO_URL) return openAt(':memory:');
  try {
    if (TURSO_URL && DB_PATH === ':memory:') {
      return openReplica(path.join(os.tmpdir(), 'arbiter-replica.db'));
    }
    if (TURSO_URL) {
      return isRemoteUrl(DB_PATH) ? openLibsql(DB_PATH) : openReplica(DB_PATH);
    }
    if (process.env.SQLITE_DRIVER === 'libsql') return openLibsql(DB_PATH);
    return openAt(DB_PATH);
  } catch (error) {
    console.error(
      `[db] cannot open ${DB_PATH} (${(error as Error).message}); falling back to an in-memory database for this instance.`,
    );
    return openAt(':memory:');
  }
}

/* Next re-evaluates modules on every hot reload in development, which would
   otherwise leave a pile of open handles to the same file. */
const globalForDb = globalThis as unknown as { __arbiterDb?: DbHandle };
export const db: DbHandle = globalForDb.__arbiterDb ?? (globalForDb.__arbiterDb = open());

export type UserRow = {
  id: number;
  username: string;
  username_key: string;
  password_hash: string;
  rating: number;
  role: Role;
  blacklisted: number;
  created_at: number;
};

export type TournamentRow = {
  id: number;
  slug: string;
  name: string;
  host_id: number;
  format: 'swiss' | 'round_robin';
  time_control: string;
  total_rounds: number;
  status: 'draft' | 'running' | 'finished';
  current_round: number;
  suspended: number;
  sandbox: number;
  created_at: number;
  started_at: number | null;
};

export type PlayerRow = {
  id: number;
  tournament_id: number;
  name: string;
  user_id: number | null;
  seed: number;
  withdrawn: number;
  created_at: number;
};

export type PairingRow = {
  id: number;
  tournament_id: number;
  round_no: number;
  board: number;
  white_id: number | null;
  black_id: number | null;
  game_id: number | null;
  result: string | null;
  is_bye: number;
};

export type MoveRecord = {
  san: string;
  uci: string;
  fen: string;
  at: number;
  whiteMs: number;
  blackMs: number;
};

export type GameRow = {
  id: number;
  tournament_id: number | null;
  round_no: number | null;
  board: number | null;
  white_player_id: number;
  black_player_id: number;
  time_control: string;
  fen: string;
  start_fen: string;
  moves: string;
  status: 'active' | 'finished';
  result: string | null;
  termination: string | null;
  source: 'tournament' | 'import';
  opening: string | null;
  fingerprint: string | null;
  white_ms: number;
  black_ms: number;
  increment_ms: number;
  per_move_ms: number;
  turn_started_at: number;
  draw_offer_by: number | null;
  created_at: number;
  updated_at: number;
};

export type ChallengeRow = {
  id: number;
  challenger_id: number;
  opponent_id: number;
  time_control: string;
  status: 'pending' | 'accepted' | 'declined';
  game_id: number | null;
  created_at: number;
  answered_at: number | null;
};

export function parseFingerprint(pieces: (string | number | null)[]): string {
  const hash = createHash('sha256');
  hash.update(pieces.map((piece) => (piece == null ? '' : String(piece))).join('|'));
  return hash.digest('hex');
}

export function parseMoves(json: string): MoveRecord[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as MoveRecord[]) : [];
  } catch {
    return [];
  }
}

export const now = () => Date.now();

/** Turns a tournament name into a URL-safe, collision-free slug. */
export function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'tournament';

  let candidate = base;
  let suffix = 2;
  const exists = db.prepare('SELECT 1 FROM tournaments WHERE slug = ?');
  while (exists.get(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
