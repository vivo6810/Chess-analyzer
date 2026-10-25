# INIT — read this first

Everything an agent needs to find its way around Arbiter without re-deriving it.
**If a fact here contradicts the code, the code wins — update this file in the same change.**

---

## What this is

A chess profile, game-history and analysis platform. A signed-in player
challenges another player, the game is played move by move on a live board with
server-authoritative clocks, and every finished game becomes a record: a profile
with derived ratings and openings, a filterable history, an export and a
Stockfish review.

There is no tournament hosting any more. Tournaments remain as *historical
records* — the standings, rounds and results of events that were played under
the old model are still browsable — but nothing creates, hosts or administrates
one. Administration (owner console, test lab, host creation) is removed front
and back.

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind 4 · SQLite.

---

## Commands

```bash
npm run dev        # dev server. MUST bind 0.0.0.0 in this sandbox: npx next dev --hostname 0.0.0.0 --port 3000
npm test           # DATABASE_PATH=:memory: node --test lib/*.test.ts  (no framework, no jsdom)
npm run typecheck  # tsc --noEmit
npm run build      # production build
bash scripts/smoke-test.sh [base-url]   # end-to-end against a RUNNING server on :3123 by default
```

Dev-server previews in this sandbox are reached through a proxy, so the browser sends
the preview hostname instead of `localhost`. Next rejects untrusted hosts in dev, so
that hostname must be listed in `allowedDevOrigins` in `next.config.ts`. **The hostname
changes whenever the sandbox is re-provisioned.** If the preview 403s or the page is
blank while `curl 127.0.0.1:3000` works, that list is the first thing to check.

`npm test` deliberately points `DATABASE_PATH` at `:memory:`: the import tests load
`lib/db.ts`, and a test that opened the real database would migrate it under the test
run. Do not remove the env prefix.

Do not background the dev server inside a one-shot shell command — it is killed when
the tool call returns. Use the shared terminal, or a detached process with the PID
recorded. Turbopack also refuses a *second* dev server for the same directory; a stale
one from a previous run holds the port and lies to every later check.

---

## Layout

```
app/
  layout.tsx              root shell: fonts, pre-paint theme script, SiteHeader
  globals.css             THE design system. Light + dark tokens, all component CSS
  page.tsx                landing
  login/ register/        auth pages
  players/                the directory, [username] profile, [username]/games history
  tournaments/            list, [slug] detail — records only, no hosting
  games/[id]/             the live board
  games/[id]/analysis/    the finished game: replay board, engine, review, PGN export
  import/                 PGN import page
  analysis/               finished games worth reviewing (index)
  api/                    route handlers — see "API" below

components/
  split-flap-text/        SplitFlapText + .css — Solari display, reusable
  site-header.tsx         the header: gooey pill from md up, drop-down menu below it
  account-chip.tsx        who is signed in (reads /api/auth/me)
  gooey-nav/              GooeyNav + .css — the pill itself (desktop only)
  masked-heading/         MaskedHeading + .css — GSAP heading clipped to media
  game-board.tsx          live game: board, clocks, actions, engine, review
  game-replay.tsx         finished game: stepped board, captured trays, exploration branch
  game-review.tsx         full-game review: verdicts, accuracy, eval graph (controlled or not)
  game-clock.tsx          the split-flap clock (wraps SplitFlapText)
  game-result.tsx         the end-of-game dialog
  engine-panel.tsx        single-position Stockfish readout
  challenge-board.tsx     send a challenge, answer the ones standing
  chess-pieces.tsx        (removed) — piece geometry now comes from react-chessboard's
                          defaultPieces, the single source since the old file was retired
  self-playing-board.tsx  decorative, replays Morphy 1858  (see hero-arena.tsx)
  floating-pieces.tsx     decorative drift

lib/
  db.ts                   SQLite behind three drivers (node:sqlite default,
                          libsql file, Turso embedded replica), schema,
                          migrations-in-place, row types
  auth.ts                 scrypt hashing, sessions, getCurrentUser()
  username.ts             the pure username key (leaf: nothing imports nothing)
  service-error.ts        ServiceError, dependency-free (pure parsers throw it without
                          the service — which reaches next/headers through auth)
  service.ts              ALL queries and writes. Route handlers call this, not SQL.
  challenge.ts            pending invitations; acceptance reuses the pairing engine
  import-pgn.ts           PGN parsing/validation and the file-into-container commit
  profiles.ts             profile/history/stats reads: filtered pages, directory, options
  rating.ts               Elo curves derived from actual finished games (imports nothing)
  openings.ts             curated ECO sequence table + longest-prefix matcher
  game.ts                 move validation, PGN build, accuracy/verdict thresholds
  review.ts               centipawn-loss thresholds and the accuracy curve (imports nothing)
  clock.ts                clock arithmetic. Imports NOTHING, on purpose.
  time-controls.ts        THE single source of truth for time controls
  use-engine.ts           Stockfish Web Worker hook
  use-theme.ts            reads the data-theme attribute (no context/provider)
  api.ts                  jsonError / readJson / requireUser / handleError / parseId
  *.test.ts               node:test suites — pure logic and the design system only

data/arbiter.db           SQLite file (WAL). Runtime state, not source.
public/engine/            Stockfish wasm + glue, loaded as a Worker by same-origin URL
scripts/smoke-test.sh     end-to-end, challenge → checkmate → export → import
```

---

## Where the data lives

SQLite, `data/arbiter.db`, opened in `lib/db.ts`. The domain code is typed
against `DbHandle` — `exec` + `prepare().get/all/run` — never against either
library, because the driver is a deployment decision:

| Mode | Choose it with | What it is |
| --- | --- | --- |
| Local file (default) | nothing (or `DATABASE_PATH`) | Node's built-in `node:sqlite`. What local dev and every test use. |
| Embedded replica | `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | A `libsql` replica of a remote primary. THE durable Vercel mode: reads/writes hit the local cache, writes reach the primary, a 60 s background sync plus the initial `sync()` reconcile instances. Vercel's Turso Marketplace integration sets exactly those two variable names. |
| Direct remote | `DATABASE_PATH=libsql://…` | Straight to the primary, nothing cached locally. |
| libSQL local engine | `SQLITE_DRIVER=libsql` | Same `libsql` driver against a plain file — the verification hook: it exercises the remote code path with no account. The suite and smoke test run green under it. |

Any failure to open (read-only host, bad token, unreachable primary) falls back
to an in-memory database with a logged error — pages render empty rather than
500. On a serverless host **without** Turso variables, the file mode lands on
the per-instance temp directory, which is workspace-local only: fine for a
demo, not durable. There is no ORM and no migration
framework: `SCHEMA` is `CREATE TABLE IF NOT EXISTS` and runs on every open, and
`ADDED_COLUMNS` + `migrate()` apply later columns and indexes — **in that order**:
the fingerprint index is created in `migrate()`, after the ALTERs, because
`CREATE TABLE IF NOT EXISTS` cannot add an index for a column an old table lacks.

| Table | Holds |
| --- | --- |
| `users` | account. `username` display, `username_key` lowercased UNIQUE — uniqueness is enforced on the key, so `Dana` and `dana` collide. The `role` column is historical: nothing in the app grants powers by it any more. |
| `sessions` | session tokens, 30 day TTL |
| `tournaments` | slug, name, host, `kind` (`event`, the challenge container, or `import`), `time_control` id, rounds, `status`. Public lists show `kind = 'event'` only. |
| `tournament_players` | the seats. `user_id` links a seat to an account — the one fact a profile and a game share. ` withdrawn` instead of delete once running. |
| `games` | one row per board. `fen`, `moves` (JSON: san/uci/fen/at/clock), `start_fen` (imports may begin from a FEN tag), `source` (`tournament`/`import`), `opening` (ECO label written on finish), `fingerprint` (sha256 of names+line+result; UNIQUE where not null — this is the dedupe). |
| `pairings` | the draw of an event. `game_id` links to `games`; `is_bye` pairings have no game row. |
| `challenges` | pending invitation, its answer, and the game it produced. |

Two rules that matter:

- **Clock arithmetic is server-authoritative.** The client renders a locally ticking
  estimate but never submits its own elapsed time. `settleClock` in `lib/clock.ts` is
  the only thing that decides a flag.
- **`lib/time-controls.ts` is the only list of time controls.** The server validates
  against that list and never trusts a duration from the client. An imported PGN that
  does not name a known control plays under `untimed`.

Ratings are **not stored**: `lib/rating.ts` walks finished games in ending order and
derives each player's Elo curve. Nothing on a profile exists that the record did not
produce — a player with no games has no rating.

---

## API

All handlers are thin: parse, authorise, call `lib/service.ts` (or the domain
module), respond. Errors go through `handleError`; `requireUser` returns a
discriminated result, never a redirect.

```
POST /api/auth/register      409 on a taken username (checked on username_key)
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me            the header chip's answer
GET  /api/challenges         incoming + outgoing for the session
POST /api/challenges         one player names another (validates the time-control id)
POST /api/challenges/[id]    accept (opponent only; creates the game) or decline
GET  /api/games/[id]         state poll, includes serverNow
POST /api/games/[id]/move    the only way a position changes
POST /api/games/[id]/action  resign / draw offers — players only
GET  /api/games/[id]/pgn     export, headers the record can actually back
POST /api/import             PGN text in, { imported: [...], skipped: n } out
```

The `/api/tournaments/**` administration routes are removed — a 404, not a hidden
endpoint. So are `/lab` and `/owner`, and with them the host settle/abort UI.

---

## Who may do what

- **Seated player** (`tournament_players.user_id`): move, and only on their own turn.
  The server derives the side to move from the FEN, so nobody can move for the
  opponent.
- **Challenged player**: the only one who can accept or decline a challenge.
- **Everyone else:** read only. There is no chat and no spectator interaction of any
  kind, by design.

A challenge acceptance builds the game through the untouched tournament path — a
two-player round robin is exactly one game — and then marks the container `kind =
'challenge'` so it never appears on the public records list.

---

## Design system

`app/globals.css` is the whole visual language: tokens, then `@layer components` for
every shared class.

**Every colour is a token, declared twice** — once in `@theme static` (light) and once
in `[data-theme='dark']`. `@theme static` and not plain `@theme`, because Tailwind
tree-shakes theme variables it cannot see being used, and a `var()` inside hand-written
CSS or an inline SVG is invisible to it. `lib/theme.test.ts` fails the build if the two
token sets diverge or a pair drops below its contrast floor — **add tokens to both
blocks or the test fails.**

Themes are switched by the `data-theme` attribute on `<html>`. There is no context and
no provider: an inline script in `app/layout.tsx` sets the attribute before first paint,
`lib/use-theme.ts` subscribes to it with a MutationObserver, and `components/theme-toggle.tsx`
writes it. Anything driven by React state instead of the attribute will flash on load.

House style is **neobrutalist**: hard 2px borders, zero border-radius, offset solid
shadows, no gradients or blur, and colour only where it carries meaning.

Colour is spent in exactly three places: the board (ivory/umber is the subject), the four
status pastels (win/loss/draw/scheduled), and time pressure on the clock. Everything
else is achromatic. That scarcity is what gives the pastels their signal.

---

## Conventions

- TypeScript strict. No `any`; `as unknown as` only where a library's types are wrong.
- Comments explain **why**, never what. If a line needs a comment to say what it does,
  rewrite the line.
- Prefer editing an existing file to adding one. New files go in the folder that owns
  the concept, with the CSS beside the component (`GooeyNav/GooeyNav.css`).
- Tests are `node:test` + `node:assert/strict`, in `lib/*.test.ts`, and must not need a
  DOM, a server, or a network. **Test files and the modules they load must import
  siblings with the explicit `.ts` extension** — node's ESM resolver needs it, the
  bundler tolerates it. Keep pure logic leaf-shaped (see `clock.ts`, `review.ts`,
  `rating.ts`, `openings.ts`, `service-error.ts`, `username.ts`): a test that pulls
  `service.ts` pulls `auth.ts`, which pulls `next/headers`, which node cannot load.
- End-to-end behaviour belongs in `scripts/smoke-test.sh`, which drives the real API.

---

## Gotchas

- `lib/clock.ts` deliberately imports nothing. Keep it that way.
- The engine is served from `/public/engine` and instantiated by same-origin URL. It is
  the worker entry point itself; wrapping it in another worker breaks it.
- `react-chessboard` v5 takes a single `options` prop, not flat props.
- One tap reaches the board twice: a finger drifting a few pixels starts and ends a
  drag, then the browser fires a click on the same square. `resolveDrop` (drop on the
  origin square is a tap) and `isTapEcho` in `lib/chess-ui.ts` are the only place that
  is resolved — do not lower `dragActivationDistance`, it is what keeps a tap a tap.
- `GooeyNav` needs ~420px. Below `md` it wraps and its gooey surface balloons over the
  page, which is why `site-header.tsx` swaps it for the drop-down menu there.
- The board colours are read from CSS custom properties in the board components, so the
  board follows the theme. Any hardcoded hex in a board or piece is a bug.
- `MaskedHeading` clips media to letterforms. With no media the heading is invisible,
  which is why the component carries a `data-has-media` fallback that paints the text.
- `GameReview` navigates itself (the live board's aside) *or* is driven (the analysis
  page passes `selectedPly`/`onSelectPly`). Do not wire both owners at once.
- The replay board's exploration branch never writes: exploratory moves live in local
  state only, and every main-navigation path folds the branch back to the record.
- Deleting a seat mid-event would rewrite everyone else's tiebreaks. Withdraw them.
- Import commits sit inside one transaction per request; the per-game `INSERT` catches
  the fingerprint `UNIQUE` violation and counts it as a skip. A unique violation on any
  *other* statement is a bug, not a skip.
- libSQL rows carry an undocumented `_metadata` timing record; `lib/db.ts`'s
  adapter strips it at the boundary. If rows start leaking driver internals into
  JSON responses, the adapter is the only place that can be wrong.
- The `db` type is the deliberately narrow `DbHandle` (`exec`, `prepare` with
  `get/all/run`). Do not widen it without checking BOTH drivers: e.g. `pragma()`
  and `transaction()` exist on libSQL but are unsupported/absent on
  `node:sqlite`.
