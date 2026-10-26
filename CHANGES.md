# CHANGES — session handoff

Written for the agent that takes this work over. `INIT.md` describes how the app
*is*; this file describes how it *got here*, what was verified, and what is still
open. **Read `INIT.md` first** — this file only layers the change history on top
of it. If a fact here contradicts the code or INIT.md, the code wins and both
docs get updated in the same change.

---

## 1. The transformation in one paragraph

The app was a tournament-hosting platform: an owner/admin console, a test lab,
host-created round-robin events with a settle/abort/advance lifecycle, and
gated pages behind an access gate. It is now a **head-to-head chess platform**:
signed-in players challenge each other by username, play on a live
board with server-authoritative clocks, and every finished game becomes a
permanent record driving profiles, derived Elo ratings, opening labels,
filterable histories, PGN export/round-trip import, and Stockfish review.
Tournament pages survive as **read-only historical records** — nothing creates,
hosts or administrates an event any more; host and owner powers were removed
front and back, and the DB `role` column is treated as historical by the whole
app.

## 2. What was removed

All of these were deleted outright (front and back), never hidden behind a flag:

- `app/lab/page.tsx`, `app/owner/page.tsx` and `lib/owner.ts` — the test lab and
  owner console.
- `app/tournaments/new/` plus `components/new-tournament-form.tsx`,
  `player-entry.tsx`, `tournament-controls.tsx` — nothing hosts an event now.
- `components/role-links.tsx`, `components/access-gate.tsx` — no role powers, no
  gate; auth now only decides what data a signed-in player can act on, not which
  pages exist.
- `app/api/tournaments/route.ts` and all of
  `app/api/tournaments/[slug]/{start,advance,players}` — a deliberate 404, not a
  hidden endpoint.
- `chess-pieces.tsx` — piece geometry comes from react-chessboard's
  `defaultPieces` since the retirement of the custom renderer.

Net diff of the working tree at time of writing: **+564 / −2190** across 40
tracked files, plus ~28 new untracked ones.

## 3. What was added

New modules (all documented in INIT.md's Layout section):

- **Challenge flow** — `lib/challenge.ts` (pending invitations; acceptance
  reuses the untouched pairing engine to build a one-game round robin, then
  marks the container `kind = 'challenge'`), `components/challenge-board.tsx`,
  `app/api/challenges/`.
- **PGN import** — `lib/import-pgn.ts` (parse, validate, fingerprint-dedupe,
  commit per request in one transaction), `app/import/`, `app/api/import/`, and
  `lib/import-pgn.test.ts`. An imported PGN that names no known time control
  plays under `untimed`.
- **Profiles & history** — `lib/profiles.ts`, `lib/rating.ts` (+test derived
  ratings curve), `app/players/` (directory, `[username]` profile,
  `[username]/games` history filters), `app/api/auth/me/` for the header chip
  (`components/account-chip.tsx`).
- **Analysis** — `lib/openings.ts` (+test, curated ECO prefix matcher),
  `components/game-replay.tsx` (stepped replay board with exploration branch
  that never writes), `app/games/[id]/analysis/`, `app/api/games/[id]/pgn/`,
  `app/analysis/` index, `lib/review.ts` accuracy thresholds.
- **Service layer** — `lib/service.ts` (all queries/writes; route handlers call
  this, not SQL), `lib/service-error.ts`, `lib/api.ts`, `lib/username.ts`.
- **Smoke test** — `scripts/smoke-test.sh` rewritten for the new flows:
  register two players → challenge → accept → play to mates → 404 checks for
  removed routes → export → re-import (dedupe skip). It has: a `code()` curl
  wrapper with a connection-level retry (first-hit Turbopack compiles reset the
  connection mid-compile), a readiness poll before probing, and cleanup that
  kills the actual port listener (`ss`-located) rather than a name pattern — a
  zombie Turbopack grandchild kept the port after plain kill otherwise.

## 4. Bugs fixed this session

- **Test hermeticity** (`lib/db.ts`, `package.json`): tests now run with
  `DATABASE_PATH=:memory:` in the npm script — they used to open the real
  database and migrate it under the test run.
- **Legacy-DB migration order** (`lib/db.ts`): the fingerprint `UNIQUE` index
  was created before the column `ALTER`s ran, so an existing older database
  would fail to open and silently fall back to memory. The index is now created
  in `migrate()`, *after* the ALTERs.
- **Import seat insert** (`lib/import-pgn.ts`): a placeholder had been replaced
  by a `NULL` literal while the parameter array still carried five values →
  SQLite parameter-count 500 on first import.
- **Re-import slug collision** (`lib/import-pgn.ts`): a second import of the
  same file tried to create a container with an existing unique slug → 500. Now
  reuses the slug-dedupe helper that already existed.

## 5. Vercel readiness (added on request)

A plain SQLite file is **not** durable storage on Vercel (their own KB: serverless
functions get no persistent filesystem — the old comment in `lib/db.ts` knew this
and degraded to per-instance `/tmp`), which for a challenge/move app means two
requests can land on different instances with different data. So `lib/db.ts`
gained a small driver layer; the service code is typed against `DbHandle`
(`exec` + `prepare().get/all/run`) and not one call site changed:

- **default** — `node:sqlite` on `DATABASE_PATH`, behaviour unchanged.
- **embedded replica** — `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (the names
  Vercel's Turso Marketplace integration sets): `libsql` keeps a local cache,
  writes go to the remote primary, an initial `sync()` plus a 60 s background
  sync (or direct remote via `DATABASE_PATH=libsql://…`) reconcile instances.
  This is the durable Vercel mode.
- **`SQLITE_DRIVER=libsql`** — forces the libSQL engine on a plain file so the
  remote code path can be verified locally with no Turso account.
- libsql rows carry an undocumented `_metadata` key — stripped in `lib/db.ts`'s
  adapter, otherwise it would leak into JSON responses.
- `serverExternalPackages: ['libsql']` keeps the native binary out of the
  bundler; `engines.node: >=22.13.0` selects Vercel's Node 24 line (where
  `node:sqlite` is present without flags).

## 6. Verification state at handoff

| Check | Result |
| --- | --- |
| `npm test` (node:test, `:memory:`) | **110/110 pass** |
| `npm run typecheck` (`tsc --noEmit`) | clean |
| `npm run build` (production, Turbopack) | succeeds |
| `bash scripts/smoke-test.sh` | **green, twice in a row** |
| Same suite under `SQLITE_DRIVER=libsql` | **110/110 pass** (the remote-path driver) |
| Same smoke test under `SQLITE_DRIVER=libsql` | green end to end (register → challenge → play → import) |
| `npx vercel@latest build --prod` | **Build Completed in .vercel/output**, Node 24 runtime traced; the lambda `filePathMap` includes `libsql`, `@libsql/linux-x64-{gnu,musl}/index.node` and the private `.next/node_modules/libsql-*` copy, which was checked to load the native binding and round-trip a query |
| `GET /games`, `/lab`, `/owner` | 404 — **intentional**, those routes no longer exist |
| Preview hostname | `allowedDevOrigins` in `next.config.ts` updated to the sandbox's `pv-…style.dev` host; it changes on re-provisioning (see INIT.md §Commands) |

**Pending, need a real browser (cloud VM has no automation):** click-through of
the challenge → board → resign/flag flow, both light & dark themes, engine
worker loading in-page. HTTP checks above say the scaffolding is sound; they do
not prove the UX.

## 7. Runtime & git state

- The full transformation is **uncommitted** — `git status` shows ~40 modified,
  ~28 untracked. Nothing has been committed this session. Commit or split it as
  the next agent deems right.
- `data/arbiter.db` (+`-shm`, `-wal`) shows as modified: that is runtime state
  from smoke/dev runs, not source. Do not commit it; consider
  `scripts/purge-smoke.mjs` / the DB path when tidying before a commit.
- `tsconfig.tsbuildinfo`, `next-env.d.ts` also churned — build artifacts.
- Dev server (when last checked) ran detached on Port 3000,
  `npx next dev --hostname 0.0.0.0 --port 3000`, log `/tmp/devserver.log`.
  Turbopack refuses a second dev server per directory, so kill the port
  listener before starting another.

## 8. Deploying to Vercel — the recipe

1. Create a Turso database (turso.tech, or via Vercel Marketplace, which wires
   the env vars automatically). Free tier is fine.
2. Import this repo; framework Next.js is auto-detected.
3. Environment variables:
   - `TURSO_DATABASE_URL` — `libsql://<db>-<org>.turso.io`
   - `TURSO_AUTH_TOKEN` — a database token
   - nothing else; `DATABASE_PATH` should stay unset on Vercel (the temp-dir
     default becomes the replica cache).
4. Deploy, then open the app and run through one challenge to confirm the
   schema migrated onto the primary.
5. Without Turso variables the deploy still works — but every instance owns an
   in-memory-of-the-disk database that dies with it. That is a demo, not the
   product.

Bugs the deployment cannot introduce (already covered by tests): migration
order on an old database, fingerprint dedupe, slug collisions.

## 9. What a takeover agent should do next

Nothing here is broken; the list is sequencing, not a fix list.

1. Read `INIT.md` fully. Most of what looks odd is deliberate (see §Gotchas
   there).
2. Do the browser pass from §6 (preview origin + two signed-in accounts), and
   repeat the smoke test once before shipping.
3. If the sandbox is re-provisioned, update `allowedDevOrigins` in
   `next.config.ts` first — that is why a fresh preview 403s while localhost
   works.
4. Any new page/route edit: update `INIT.md` in the same change. Its rule is
   code wins over docs. The Turso account itself is the only remaining user
   step in §8.

## cookie-only rewrite (2026-10-25)

The product has moved from account-backed games and tournaments to local chess
play and analysis. The login, registration, challenge, tournament, player
directory, import, and server game APIs were removed with their database and
auth modules. The top navigation now has only Play, Analyze, and Profile.

Games can be played against eight client-side Stockfish levels with clocks,
then handed directly to the analyzer. Analysis accepts a Chess.com username or
PGN, stores compact history in browser cookies, and adds brilliant-sacrifice
labels, evaluation and clock graphs, accuracy estimates, and verdict counts.
The Chess.com public API is fetched through a stateless, cached route. Profile
reports aggregate a bounded set of recent games in the browser.

The following Vercel environment variables are no longer needed and should be
removed from the project settings: `TURSO_*` (including `TURSO_DATABASE_URL`
and `TURSO_AUTH_TOKEN`), `SQLITE_DRIVER`, and `DATABASE_PATH`. There is no
server-side database or user-data persistence in this version.

## User-reported follow-ups (2026-10-25)

The user authorized implementing these follow-ups after finishing the issue
list. The current UI and delivery status is recorded below.

- **Recent Chess.com games cutoff — fixed in the current worktree:** the proxy
  previously stopped after the first 60 games in chronological archive order,
  before sorting. It now traverses archives newest-first and then sorts and
  applies the requested limit. Verified the live Magnus Carlsen response
  returns October 23 games against Toxicmybrother at the top, and the page
  lists those games.
- **Dedicated analysis page — implemented:** selecting a Chess.com recent
  game opens its own `/analysis/[id]` page with the selected replay and review.
- **Single palette and analytics contrast — implemented:** removed the
  site-wide theme toggle and alternate palette; analysis bars use distinct
  grayscale tones.
- **Board player layout, clocks, and small-screen sizing — implemented:** the
  replay and play boards show names, captured pieces, a compact `+N` material
  lead only when positive, and side clocks. Empty-capture labels and zero
  material text are omitted. The material badge has a high-contrast dark fill.
  Board sizing adapts to the viewport.
- **Play-board input and end-game effects — implemented:** clicking a piece
  shows its legal destinations as grey dots/capture rings, constrained by
  chess.js legal-move rules (including pins). A losing king falls 90 degrees
  right and a loss triggers a translucent red board ripple; wins show board
  confetti. Reduced-motion preferences suppress the moving effects.
- **Analysis summary and move navigation — implemented:** verdict totals are
  compact, `Show more` reveals the move details, selecting a move seeks the
  board, and each reviewed move has a verdict badge in the move list.
- **Verdict wording — implemented:** the full label `inaccuracy` is shown.
- **Profile rating graphs and favorite openings — implemented:** separate
  rating graphs appear for modes in the recent game sample; opening names are
  bulleted and their ECO prefixes are removed.
