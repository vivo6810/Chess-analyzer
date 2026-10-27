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
- **Tournament Club palette — implemented:** applied the warm charcoal and
  ivory interface, tournament-green actions and board, amber move hints, and
  semantic review colors; the site remains a single palette without a theme
  toggle.
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
- **Profile report coverage — implemented (2026-10-26):** users can request a chosen game
  count or all available Chess.com archives. Reports show average game rating,
  each mode's highest Chess.com rating, average player accuracy, and average
  player blunders per analyzed match.
- **Screenshot copy cleanup — implemented (2026-10-26):** removed the promotional browser
  tagline, the default move prompt, the footer blurb, and the old 20-game
  report hint.
- **Latest palette preference — implemented (2026-10-26):** the user's choice
  of Option B (Grandmaster Slate) is now applied; see the section below.
- **Validation after these updates:** `npm test` (104 passing), `npm run
  typecheck`, `npm run build`, and `git diff --check` all pass. The refreshed
  `/profile` preview renders the game-count field and is available at
  `http://127.0.0.1:3001`.

## Grandmaster Slate palette (2026-10-26)

The site's single palette switched from the retired Option C (Tournament Club)
to the user's Option B (Grandmaster Slate). All interface color still routes
through the `@theme static` tokens in `app/globals.css`; no component hard-codes
a surface color.

- Surfaces: canvas `#0B0F17` midnight navy, panels `#151C28` dark slate,
  hover/active rows `#1E293B` steel, borders `#283548` muted slate line, offset
  shadows `#283548` (visible, per the `--color-brut` contrast test).
- Text: primary `#F8FAFC` ice, captions `#94A3B8` cool gray.
- Accent: `#38BDF8` electric sky (primary) and a new `--color-accent-2`
  `#818CF8` soft indigo, used for square-selection markers and the clock
  graph's black series.
- Board: slate/ash light `#B0B3B8` / dark `#47494D`, with the brief's
  translucent gold last-move wash via the new `--color-last-move` `#EAB308`
  token mixed with transparency where it is applied.
- Evaluation bars (replay's vertical bar and the engine panel's horizontal
  bar) now use the brief's exact fills: `--color-eval-white` `#E2E8F0` for the
  White share, `--color-eval-black` `#27272A` for the Black share. Verdict
  colors were already the brief's values and are unchanged.
- Status fills (win/loss/draw/info), split-flap clock tile and the play-page
  confetti family were re-derived for navy, each keeping its existing
  `lib/theme.test.ts` contrast floor.
- `lib/theme.test.ts` now pins the exact brief hexes for canvas, panel,
  accent, both board squares and both eval-bar fills, so a silent drift back
  to the warm palette would fail the suite.

Verified: `npm test` 104/104, `npm run typecheck` clean, `npm run build`
succeeds (all routes prerender/serve dynamically as before).

## High-traffic performance layer (2026-10-26)

Traffic-facing changes, all verified on the live routes:

- **/api/chesscom is now edge-cacheable.** Success responses carry
  `Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate=172800`,
  so a burst of visitors for one username pays a single archive walk instead
  of one per request; visitors re-clicking a profile within 5 minutes reuse
  their own copy. Every error response (400/404/502) is `no-store` so a
  transient upstream failure never sticks in any cache layer.
- **Month archives fetch with bounded concurrency (4)** instead of strictly
  serial, roughly quartering the latency of `months`-window fetches and
  `all` reports. `Promise.all` preserves archive order; over-fetch is
  bounded to one batch and the payload is sorted + limited as before.
- **Upstream calls have a 10 s timeout** (`AbortSignal.timeout`) so a hung
  chess.com request cannot pin a serverless invocation, plus one fast
  (500 ms) retry for 429/5xx and timeouts only — 4xx answers are never
  retried, since each retry burns one rate-limit window.
- **/engine/ assets have an explicit CDN policy**
  (`public, max-age=14400, stale-while-revalidate=604800` in
  `next.config.ts`): the ~1.8 MB worker+WASM pair stops re-pulling on cold
  CDN nodes. Deliberately not `immutable` because the filename is not
  versioned and the pair must update atomically.
- The client engine and analytics remain zero-server-cost by design; no DB
  and no other routes were touched.

Verified live against the dev server: success payload carries the shared
cache header; 404 and 400 responses carry `no-store`; the engine asset
carries its CDN policy. `npm test` 104/104, `tsc --noEmit` clean, production
build succeeds. Note: deployment can only confirm `s-maxage` behavior on
Vercel's CDN itself, which local HTTP checks cannot observe.

## Nav flight restoration (2026-10-26)

The gooey pill flight was effectively invisible when switching pages:

- **Root cause pair.** (1) The WebGL shader cannot follow CSS variables, so in
  the header's adaptive mode the canvas painted the component's standalone
  demo charcoal (`#27272a`) while the label ink followed the palette — the
  dark-on-dark text the previous fix targeted, still present whenever the
  stylesheet resolved late. (2) More importantly, `next dev` (Turbopack and
  webpack alike) hard-navigates on link clicks in this sandbox — verified by
  a window-marker probe that lost its marker and a `document`-type request
  per click — so every dev click remounts the root layout and the nav
  re-`settle()`s instantly. The production build navigates client-side and
  the flight runs; a full reload can never show it.
- **Fixes.** The adaptive pill is now resolved with a one-second
  requestAnimationFrame retry (stylesheets can load after the first layout
  effect), and the active-ink color is derived from the resolved pill and
  set inline so pill and label are always a contrast pair; explicit
  `color`/`activeTextColor` callers still win. The header passes
  `animationTime 900`, `particleCount 22`, `spread 72`, `wobble 0.62` so the
  flight reads for roughly a second instead of settling in ~150 ms.
- **Preview setup.** The panel preview now serves `next build` + `next start`
  on port 3000 rather than `next dev`, so what the user reviews includes the
  true SPA navigation and flight. Keep dev-mode diagnostics away from
  conclusions about animations: verify against a production server first.
- Programmatic verification used a locally extracted chromium (system
  libraries fetched without root); the tooling was removed after
  verification. Frames captured before and after the fix are described in
  this section only; no test automation remains in the repo.

## Move verdict badges (2026-10-27)

The user reviewed the badge design outside the app (an eight-glyph set done in
the same palette brief — disc tokens with the symbol cut out in the canvas
colour, matte 12%-fill pills) and asked it integrated, wired to the *engine's*
classifications, then committed.

- **`components/verdict-badge.tsx` is the single source** for glyphs, labels
  and colors. The engine verdict is the spine, not the design's word list:
  brilliant→`!!`, best→`★`, excellent→`!`, good→book glyph, inaccuracy→`?!`,
  mistake→`?`, blunder→`??`, forced→`—` (the dash; forced grades the absence
  of an alternative, not the move). All glyph geometry lives in one hidden
  `<svg>` sprite (`<VerdictSprite />`, rendered once in `app/layout.tsx`);
  badges are `<use href="#arb-verdict-…">` references, so an 80-ply move
  list does not repeat path data.
- **Cutouts are `var(--color-canvas,#0f0f12)`**, not the design's literal
  `#0F0F12`, so the negative space always matches the page it sits on.
- **Colors** reuse the existing `--color-move-*` tokens (they already were
  the brief's hexes). The tally bar changed two rows to match the pills:
  excellent (`bg-move-critical`, the brief's "great" steel blue) and good
  (`bg-move-book`, bronze). Brilliant/best/inaccuracy/mistake/blunder bars
  were already correct; forced stays neutral. `VERDICT_STYLE` (the old
  solid-fill badge map) was deleted with its last two call sites.
- **Where they render:** the review move list uses `VerdictPill` (glyph +
  engine label, tinted per verdict); the summary chips are pill-tinted spans
  with the glyph and count; the replay move list uses `VerdictToken` (the
  15px dark-ringed disc, replacing the colored-text `<sup>`).
- **Board overlay:** the replay board's arrival square for the current move
  wears a 4px inset ring in the verdict's color at 70%, layered over the
  gold last-move wash; forced is skipped. `squareStyles`'s memo now depends
  on `moveVerdicts`.
- New CSS (`verdict-pill`, `verdict-token`, `verdict-color--*`,
  `verdict-pill--*`) sits in its own `@layer components` block using
  `color-mix` at use time — deliberately **outside** `@theme static`, because
  `lib/theme.test.ts` requires every token in that block to be a plain hex.

Verified: `npm test` 104/104, `npm run typecheck` clean, `npm run build`
succeeds. Badge pixels were reviewed standalone via `artifacts/badge-preview.html`;
the in-app rendering needs the usual browser pass (cloud VM has no automation).

## Micro-animations pass (2026-10-27)

The user supplied a five-part micro-animation brief and asked it implemented. Each
piece was matched to what the app actually has — one part has no anchor and was
recorded as not applicable:

- **Tactile press (`globals.css`):** `.press` now sinks 2px into its own offset
  shadow on hover (painting `3px 3px` while the base utility is `5px 5px`) and
  bottoms out fully at `:active` (`translate(5px, 5px)`, shadow none) — the
  design's mechanical two-stage press measured against our real shadow token.
  Reduced-motion suppression already covered `.press`.
- **Verdict reactions (replay board):** brilliant and blunder now react —
  brilliant runs a one-shot cyan emissive ring (`arb-verdict-brilliant`) that
  expands past the static inset ring, blunder a 380ms horizontal recoil shake
  (`arb-verdict-blunder`). Keyframes raise their colors from the
  `--color-move-*` tokens at run time so the palette stays single-sourced.
  Other verdicts keep the quiet static ring; reduced-motion strips the
  animations (`[data-square] { animation: none !important }`) and the static
  ring remains as the fallback.
- **Marquee (`notation-marquee.tsx` + CSS):** the landing ticker pauses on
  hover, the hovered token lifts to ice, and Morphy's three sacrifices
  (`Nxb5`, `Rxd7+`, `Qb8+`) are tinted with the brilliant cyan token, bold.
  The `theme.test.ts` "landing limited to hero + marquee" check is untouched.
- **Engine presence dot (`.engine-status-dot`):** a 6px amber terminal-blink
  (steps) beside the engine's name in the active `PlayerBoardRow` and on the
  play page's "Stockfish is thinking…" line. Reduced-motion shows a static dot.
- **Verdict tokens snap in:** `VerdictToken` discs mount with an elastic
  overshoot (`arb-badge-snap-in`), replacing a fade-less pop-in.
- **Not applicable — best-move arrow draw-on:** the design animates an SVG
  engine-recommendation arrow; the app draws no engine arrows anywhere (grep:
  none exist, engine output is verbal + eval bar). If best-move arrows are
  added later, attach `stroke-dasharray`/`stroke-dashoffset` on the path and
  the existing `--ease-out-editorial` keyframe pattern applies.

Verified: `npm test` 104/104, `tsc --noEmit` clean, production build succeeds.
Animation motion itself needs the browser pass (no automation in this VM).
