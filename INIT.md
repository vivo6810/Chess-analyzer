# INIT — the complete handoff. Read every word before touching anything.

**Audience:** you are an AI agent taking over this repo. You may think you know
how to code, but this codebase has rules, traps and a frozen product spec. This
file teaches you all of them. If you violate a rule written here, the previous
agent's work (all of it, committed or not) will fight you and you will lose.

**Rule zero:** make changes in `chess_tournament/` only. Never touch sibling
directories, never rewrite history, never force-push. Everything in this file is
in the user's language: English.

---

## Table of contents

1. The product, frozen
2. The two repos and how syncing works (read twice)
3. State at handoff — what is done, what is half-done
4. Environment and commands
5. How code is written in this repo (style law)
6. Architecture map — what survives, what dies, what is new
7. Module-by-module build instructions
   - 7.1 `lib/pgn.ts` (done — read to understand)
   - 7.2 `lib/game.ts` (done)
   - 7.3 Verdicts + brilliant detection (`lib/review.ts`)
   - 7.4 Engine levels (`lib/engine-levels.ts` — to write)
   - 7.5 The engine worker (`lib/use-engine.ts` — exists, do not break)
   - 7.6 Clock (`lib/clock.ts` — exists, keep and test)
   - 7.7 Cookie storage (`lib/local-user.ts` — to write)
   - 7.8 Chess.com proxy (`app/api/chesscom/[username]/route.ts` — to write)
   - 7.9 `components/game-replay.tsx` (exists; small edits)
   - 7.10 `components/game-review.tsx` (exists; extend carefully)
   - 7.11 `/play` page (to write)
   - 7.12 `/analysis` page (to write)
   - 7.13 `/profile` page (to write)
   - 7.14 Landing, header, footer, layout (edits specified)
8. Deletion checklist (exact paths)
9. Config edits (exact)
10. Docs and scripts to update
11. Verification pipeline
12. Commit + GitHub push procedure (exact commands)
13. Trap list — every way a careless agent breaks this app
14. Future work pool

---

## 1. The product, frozen

These decisions were made with the user and are **not yours to change**. When a
requirement here conflicts with something you find in old code, this list wins —
the old code that contradicts it is to be deleted (§8).

**What the app is.** A free chess analysis site. No accounts, no sign-in, no
server database, no backend storage of any kind. User-specific data lives in
**cookies** on the user's browser. The server statelessly proxies
Chess.com's public API. Vercel-hosted (current Node line, `engines.node >= 22.13.0`).

**Top bar (final).** Exactly three items — nothing else, no bracket pill
visuals from the old design's gooey nav beyond the existing component's look:

1. **`/play` — Play.** The user picks a **Stockfish level** (1–8, engine
   running client-side in a Web Worker) and plays one game against it, with a
   real clock (module exists). After the game ends, the UI offers
   **"Analyse this game"**, which hands the played game to `/analysis` and also
   remembers it in the cookies.
2. **`/analysis` — Analyze.** Two ways to load one game:
   - enter **any Chess.com username** → a public-API fetch lists their recent
     games with **each side's rating**, click one to analyze it;
   - or **paste/upload a PGN**.
   The analysis shows: player ratings of the game (from Chess.com metadata when
   available), verdict per move — **excellent, brilliant, best, good,
   inaccuracy (shown as "inexact"), mistake, blunder** where **brilliant is
   reserved for sacrifices** (recipe in §7.3) — a large **eval bar** next to
   the board, a **per-move eval graph (line, zero line = equal)**, the
   **clock remaining time per move** rendered with the move list, an
   **approximate time-per-move summary at the bottom**, and the full analytics
   set: white/black accuracy, estimated strength, verdict tally bar.
3. **`/profile` — Profile analysis.** Enter a Chess.com username → over their
   recent games (the same proxy), the app runs a lighter **aggregate report**:
   counts per verdict (blunders, mistakes, brilliants, etc.), an **Elo-style
   rating graph over time per mode** (bullet/blitz/rapid/daily from
   Chess.com), win/draw/loss rate, favorite openings (ECO names), most-blundered
   phase, average centipawn loss trend. One entry = one profile; the report is
   client-computed from fetched PGNs. Profiles looked at are remembered in
   cookies.

**Landing page.** Keep the **top hero section only** (headline, sub copy, two
CTA buttons linking to `/play` and `/analysis`, `HeroArena` decorative board).
Delete the middle ink band (bento cards 01–05) and the bottom "How it works"
step cards section, completely.

**Cookie storage (final).** All "user data" = cookies, no `localStorage` for
this (theme stays in `localStorage` as-is):
- `arbiter:profiles` — JSON array of `{ username: string; name?: string; ts: number }`, 8 max.
- `arbiter:analyses` — JSON array of `{ id: string; source: 'chesscom'|'pgn'|'play'; white: string; black: string; result: string; played?: string; profile?: string; stored: boolean; ts: number }`, 12 max, newest first, deduped by `id`.
- `arbiter:g:<id>` — the compact PGN text of one analyzed game so it can be reopened from history. **One cookie per game, each under 3,500 bytes** (cookie budget); do not store if longer.
- All cookies: `SameSite=Lax`, `Path=/`, `Max-Age=31536000`, **not** httpOnly (the client needs to read them).
- Reading cookies is **client-only** (`document.cookie`), always after mount, into state — never during render — to avoid hydration mismatches.

**Landing/installed truth.** The deployed target is Vercel importing
`Chess-analyzer` where the **repo root is the app root** (already flattened).
Do not resurrect the `chess_tournament/` wrapper on GitHub. Do not add back
`libsql`, the DB, auth, tournaments, challenges or site profiles.

---

## 2. The two repos and how syncing works (read twice)

There are **two** GitHub repos:

- **`vivo6810/chess_tournament`** — the user's public project repo. Its `main`
  lags behind (it has never received the newer commits; pushing there needs
  credentials only the user can give).
- **`vivo6810/Chess-analyzer`** — the **connected** repo. Vercel imports it.
  Its `main` has the full mirrored history and, crucially, the **app files at
  the repo ROOT** (the nesting was flattened by design for Vercel).

In this workspace, the app lives in `chess_tournament/` — a **nested git
repository with its own history**. Commits you make happen **in the nested
repo**. But "publishing" means: creating mirror commits that carry the nested
history into Chess-analyzer, **with the nested tree placed at the root of the
outer repo's tree** (not under `chess_tournament/`).

The outer workspace repo is a managed checkpoint repo (`/workspace/repo.git`)
whose worktree only holds a gitlink to the nested repo. Its HEAD branch is
`freebuff/01465cccf9af6a702553f360`.

**The push procedure (exact; a "dumb" mistake here breaks everything):**
Never call `git checkout <branch>` in the live workspace. Never touch the
nested repo's remote. Only the platform's `cloud_git` tool can authenticate to
GitHub, and it pushes **the worktree's current HEAD**. So:

```bash
cd /workspace/chats/<YOUR_CHAT_ID>          # the app worktree root
set -e
# 1. pull nested history (objects) into the outer repo:
git fetch --no-tags chess_tournament/.git main:refs/nested/mirror
# 2. build the flat-tree commit on top of the remote's current main:
start=$(git rev-parse FETCH_HEAD)           # current Chess-analyzer main
tree=$(git rev-parse refs/nested/mirror^{tree})
#    commit-tree with the NESTED tree as the ENTIRE root tree (flat layout)
commit=$(printf '%s' "<commit message>" | \
  GIT_AUTHOR_NAME="serverformc" GIT_AUTHOR_EMAIL=<author email from nested log> \
  GIT_COMMITTER_NAME="serverformc" GIT_COMMITTER_EMAIL=<committer email from nested log> \
  git commit-tree "$tree" -p "$start")
git update-ref refs/heads/mirror-sync "$commit"
git symbolic-ref HEAD refs/heads/mirror-sync   # point the worktree HEAD there (no checkout!)
# 3. push, then RESTORE:
#    (then run the platform push tool: push HEAD -> branch "main")
# 4. restore:
git symbolic-ref HEAD refs/heads/freebuff/<YOUR_CHAT_ID>
git fetch    # verify; log --oneline FETCH_HEAD -3; ls-tree FETCH_HEAD (must show package.json at root)
```

If you cannot stand where you are (4. vs instructions), STOP and re-read. The
`symbolic-ref` dance points HEAD at the mirror ref without rewriting the
working tree, because the mirror tree ≠ worktree contents (worktree holds the
gitlink; the mirror tree holds plain files). A real checkout would shred files.

---

## 3. State at handoff — what is done, what is half-done

**Done and committed** (before this file): app overhaul to a platform with
auth + DB (login, tournaments, challenges, profiles, leaderboard, site players,
import pipeline, driver-agnostic `lib/db.ts` with `node:sqlite`/libsql
drivers). **Most of that is now due for deletion** per §8 — it served a product
the user abandoned.

**Done locally, NOT yet committed at handoff** (the "new code" being committed
with this very INIT file):

- `lib/pgn.ts` + `lib/pgn.test.ts` — **the new DB-free PGN parser**, complete
  and consistent. It ports the old validated parser (which once wrote to the
  DB) but produces plain `ParsedGame` objects and **also captures `[%clk]`
  comments into `move.clk` seconds** (Chess.com archives always carry them).
  `splitPgn`, `parsePgn`, `parseOneGame`, `PgnError` are the API. This file is
  finished; do not redesign it, extend it only for `renderPgn` (§7.1).
- `lib/game.ts` — slimmed to the three pure functions the analysis UI needs:
  `evaluatePosition` (board endings), `legalMoveCount` (used by the review for
  `forced` moves), `buildPgn` (export). Clocks and live-move application were
  cut. Its test file was rewritten to match.
- Pending review tests: the old `game.test.ts` had verdict tests that belong in
  `lib/review.test.ts` — create that file when you touch `review.ts` (§7.3).

**Verification state at handoff.** After `npm ci`, the surviving suites are
**green — 92/92**: `pgn.test.ts` (11), `game.test.ts` (7), `openings.test.ts`
(7), `chess-ui.test.ts` (23), `time-controls.test.ts` (8), `theme.test.ts`
(19), plus the review module's own assertions currently living inside the
old suites. The ONLY red allowance is `lib/import-pgn.test.ts`, which stays
red on purpose until its files are deleted (§8) — do not "fix" it.

**Know the trap:** `npm run typecheck` currently FAILS on files scheduled for
deletion (old `service.ts` imports `applyMove` from the slimmed `game.ts`).
Delete first (§8), then verify. Do not re-add clocks to `game.ts`.

**Environment note:** `node_modules` may be missing after any workspace
restore (install again with `npm ci`). The failing pattern
`Cannot find package 'chess.js'` always means the environment, never the code.

---

## 4. Environment and commands

```bash
cd chess_tournament          # where everything happens
npm install                  # if node_modules is missing (check first!)
npm run typecheck            # tsc --noEmit, must be CLEAN before any commit
npm test                     # node --test, must be ALL GREEN before any commit
npm run build                # production build, before pushing to GitHub
npm run dev                  # dev server (preview runs on port 3000)
```

- Node requirement `>=22.13`. Tests run under Node's built-in TS stripping —
  that is why every intra-`lib` import carries an explicit **`.ts`
  extension** (`./pgn.ts`), and why `tsconfig.json` sets
  `allowImportingTsExtensions`. App code imports by path alias
  `@/components/...`, `@/lib/...` (no extension).
- There is no test runner config; `node --test` discovers `*.test.ts` near
  `lib/`. When you write a pure module, you write its test in the same list.
- The engine ships as a static asset: `public/engine/stockfish-19-lite-single.js`.
  It is a ~1.8 MB WASM single-threaded Stockfish whose emscripten glue **is**
  the worker entry point. It must never be imported/bundled; it is loaded by a
  same-origin `new Worker('/engine/stockfish-19-lite-single.js')`.  The file
  you will find on disk is `lib/use-engine.ts` and it already does this
  correctly — study it, do not wrap it.

---

## 5. How code is written in this repo (style law)

These patterns are consistent across the codebase. Match them exactly; a
reviewer (and the user) reads diffs against them.

1. **Comments explain WHY, never WHAT.** Every non-trivial decision gets a
   comment justifying it against an alternative. Comments may be long. Example
   taken from the parser:

   ```ts
   /* A result the header does not carry may still be readable from the final
      position — checkmate says who won even when the tags were stripped. */
   ```

   No `// increment i` noise. No TODO without a plan.
2. **Pure logic lives in `lib/`, React only orchestrates.** Everything that can
   be arithmetic gets a plain-function module with `node --test` coverage.
   Components read state, render, call handlers; they contain no `Math` that a
   test would want.
3. **Errors are typed and shown.** Domain modules throw typed errors
   (`PgnError`) with messages written for the UI to display verbatim. Never
   swallow errors; never `catch {}` without a comment saying why it is safe.
4. **No `any`.** Bindables are typed. Puzzles out: `as never` only for
   chess.js's square indexing quirks.
5. **CSS is Tailwind v4 utilities + design tokens** defined under
   `app/globals.css` (`bg-canvas`, `text-ink`, `border-line`, `bg-surface`,
   `bg-accent`, `text-on-accent`, `bg-bone`, `shadow-brut`, `badge`,
   `press`, `field`, `field-label`, `board-shell`). Use them; do not invent
   one-off colors. Dark/light themes come from `[data-theme]` — the theme
   script in `app/layout.tsx` sets it pre-paint (do not break that).
6. **Accessibility is not negotiable:** buttons have labels, interactive cards
   are `<button>`, dialogs have `role="dialog"` + label, keyboard flows
   (arrow-key stepping exists in `game-replay.tsx` — keep it).
7. **Client components say `'use client';` first line.** Server components
   avoid fetching DBs (there is no DB) and prefer static text.
8. **One job per file.** A module that starts handling two concerns is split.
9. **Naming:** domain words (`verdict`, `ply`, `player`, `seat`, `loss`, `cp`).
   Half-moves are "plies". `san` = Standard Algebraic Notation, `uci` = the
   `e2e4` coordinate pair string, `fen` = position string, `clk` = seconds
   remaining.
10. **Hydration discipline:** anything reading cookies/localStorage renders a
    skeleton/empty shell during SSR and fills after a `useEffect` +
    `setState`. This theme-via-`localStorage` app already set that pattern.

---

## 6. Architecture map

**Survive as-is (do not edit unless a spec below says so):**
`lib/openings.ts`(+`.test.ts`) — ECO table by move sequence; `lib/chess-ui.ts`
(+test) — square/target helpers; `lib/review.ts` — verdict thresholds (you'll
extend it); `lib/use-engine.ts` — worker client; `lib/use-theme.ts`; theme
`components/theme-toggle.tsx`; `components/gooey-nav/GooeyNav.tsx` (header );
`components/engine-panel.tsx` (fen-driven, depth 12); decorative folders
(`fold-text`, `split-flap-text`, `variable-proximity`, `notation-marquee`,
`hero-arena` — used by landing hero); `components/site-footer.tsx` (rewrite
columns, trivial); `app/globals.css` (only add, don't purge yet).

**Survive with edits:** `components/game-replay.tsx` (§7.9),
`components/game-review.tsx` (§7.10), `components/site-header.tsx` (§7.14),
`app/layout.tsx` (metadata; keep theme script), `lib/game.ts`/`pgn.ts`/
`pgn.test.ts` (done), `lib/clock.ts` + `lib/time-controls.ts` (keep for PLAY;
their tests were inside old `game.test.ts` — recreate as `lib/clock.test.ts`
per §7.6 with the original test cases listed there).

**To write (new):** the modules in §7.4–7.13 and the `api/chesscom` route.

**To delete:** §8 list. Then their imports disappear with them.

---

## 7. Module-by-module build instructions

### 7.1 `lib/pgn.ts` — done, plus one addition

Current shape (study it before using): `PgnMove = { san; uci; fen; clk? }`,
`ParsedGame = { white; black; result; termination; timeControl; startFen; eventName; site; playedAt; opening; moves }`.
Parsing rules that matter downstream:

- `clk` is **seconds remaining after the move**, from `[%clk h:mm:ss]`.
- result falls back to the position when tags are missing; a `*` result is
  legal output type `'1/2-1/2' | '1-0' | '0-1' | '*'`.

**The one addition to write: `renderPgn(headers, moves, result?) → string`.**
Used by the Play page (export the played game so Analyze can ingest it with
clocks). Format:

```
[White "Aditya"]
[Black "Engine L4"]
[Result "1-0"]

1. e4 {[%clk 0:02:58]} e5 {[%clk 0:03:00]} 2. Nf3 {[%clk 0:02:52]} ...
1-0
```

- Headers in PGN order you choose (Event, Site, Date, White, Black, Result,
  TimeControl), two per line? No — this repo renders one per line (simple).
- Clock comment format: `[%clk 0:02:58]` zero-padded h:mm:ss (round seconds).
- Move numbering: white move gets `N.`, black gets previous number + `...`.
- Result token at the end. Fold long line at ~80 chars by wrapping after a
  comment (any whitespace is fine for parsers — but keep it readable).
- Add tests to `lib/pgn.test.ts`: round-trip (`parseOneGame(renderPgn(...))`
  preserves san list and clk values; render with no clk omits comments).

### 7.2 `lib/game.ts` — done

`evaluatePosition(chessInstance)` → `{result, termination}` | null;
`legalMoveCount(fen)` → number; `buildPgn(headers, moves, result)` → string
(curly-brace-safe exporter used elsewhere; if `renderPgn` supersedes it for
clock-bearing games keep both — buildPgn is for headerless quick export).

### 7.3 Verdicts + brilliant detection (`lib/review.ts`) — write `review.test.ts`

Current thresholds (do not change): `EXCELLENT < 20`, `INACCURACY 50`,
`MISTAKE 100`, `BLUNDER 200` centipawns. `classifyMove(loss, context)` currently
returns `forced | best | excellent | good | inaccuracy | mistake | blunder`.

**Extend exactly like this (user-specified, Chess.com-like):**

1. Add `'brilliant'` to `MoveVerdict`.
2. Add a pure helper in the same file:

   ```ts
   export function detectSacrifice(
     fenAfter: string,             // position AFTER the mover's move
     opponentBestUci: string | null, // engine's best move for the OPPONENT there
   ): boolean
   ```

   Algorithm (approximation is fine; document it): piece values `{p:1, n:3,
   b:3, r:5, q:9}`. From `fenAfter`, build `new Chess(fenAfter)`; if
   `opponentBestUci` is null → false (no engine info, no verdict). Play
   opponent's best move. If it is **not a capture** → false (a brilliant also
   needs some material being given up). Let `gain` = value of the piece the
   opponent captured. Now in the resulting position, scan the mover's legal
   replies for the best immediate recapture clawback `claw` (max captured
   value). Return `gain >= 3 && (gain - claw) >= 3` — i.e. the mover is down
   at least a piece's worth of material even after their best reply. Comment
   every step. This is deliberately board-only (no deep lines), deterministic
   and testable.
3. In `classifyMove`, accept `sacrifice?: boolean` in `context`. Order of
   precedence becomes: `forced` → `brilliant` (sacrifice && loss < EXCELLENT_CP)
   → `best` (matchesBestMove) → then the loss ladder as today (excellent/good/
   inaccuracy/mistake/blunder). A brilliant is only reachable for intentful,
   accurate moves: that is the "reserved for sacrifices" clause the user wrote.
4. `review.test.ts` — port the old verdict tests (they used to live inside
   `game.test.ts`; the ladder: 0/19→excellent, 20/49→good, 50/99→inaccuracy,
   100/199→mistake, ≥200→blunder, `onlyMove`→forced, `matchesBestMove`→best)
   plus new ones: a known sacrifice turns `best` into `brilliant` (e.g. knight
   offered to a pawn), a recaptured sacrifice does not, no-opponent-info
   returns false.

### 7.4 Engine levels (`lib/engine-levels.ts`) — to write

```ts
export type EngineLevel = { id: number; label: string; depth: number; chaos: number; eloLabel?: string };
export const ENGINE_LEVELS: EngineLevel[] = [
  // depth = how deep useEngine().analyse() searches for THIS side's move;
  // chaos = probability 0..1 that the move played is a random legal move
  { id: 1, label: 'Level 1', depth: 1, chaos: 0.3 },
  { id: 2, label: 'Level 2', depth: 2, chaos: 0.2 },
  { id: 3, label: 'Level 3', depth: 3, chaos: 0.1 },
  { id: 4, label: 'Level 4', depth: 5, chaos: 0.05 },
  { id: 5, label: 'Level 5', depth: 8, chaos: 0 },
  { id: 6, label: 'Level 6', depth: 12, chaos: 0 },
  { id: 7, label: 'Level 7', depth: 14, chaos: 0 },
  { id: 8, label: 'Level 8', depth: 18, chaos: 0 },
];
export const DEFAULT_LEVEL_ID = 3;
export function getLevel(id): EngineLevel; // throws on unknown
```

Comment why chaos exists: depth alone cannot model "weak"; a low depth Stockfish
still avoids mate-in-1 giveaways — randomness simulates a weaker player.
Export `pickEngineMove(fen, level, analyse): Promise<{uci, random}>` helper in
the same file if convenient, or do it in the Play page — but the wobble rule
(chaos chance → `Math.random() < chaos` → random legal move) must live in ONE
place. Add a small test (`engine-levels.test.ts`: level table sorted, ids
unique, getLevel throws).

### 7.5 The engine worker (`lib/use-engine.ts`) — exists, LEARN it

API: `useEngine()` returns `{ ready, error, analyse, stop }`. Pattern:

- `analyse(fen, depth, onUpdate?)` resolves `{ depth; cp; mate; best; pv }` —
  `cp`/`mate` are from the point of view of the side to move, `best` is UCI,
  `pv` is SAN tokens.
- Helpers `toWhitePawns(score, turn)` and `formatScore(score, turn)` exist for
  display (white-relative values).
- Boot is idle-scheduled (requestIdleCallback) — a first-paint protection, do not "optimize" it away.
- Protocol lines handled: `uciok` → `isready`, `readyok` → ready, `info ...`
  (parsed via `parseInfo` regex: depth, score cp/mate, pv), `bestmove <uci>`.
- Concurrency: ONE pending search; `analyse` posts `stop` first. For review
  (hundreds of positions) that is the design; for the Play page the same
  promise-per-position flow works.
- **Do not** wrap the worker in your own worker (the comment in the file
  explains the emscripten glue break). Do not `import` the engine file.

**Play-page usage** (§7.11): for the engine's chosen move —
`const effect = await analyse(fen, level.depth)`; if `Math.random() < chaos`,
choose uniformly among `new Chess(fen).moves()` (SAN), else use
`effect.best ?? random`. Prefer `effect.best`.

### 7.6 Clock (`lib/clock.ts`) — exists for PLAY; recreate its tests

Semantics recap (function `settleClock(bank, mover, nowMs, control)`):
`ClockFields = { white_ms; black_ms; increment_ms; per_move_ms; turn_started_at }`.
`flagged: 'white'|'black'|null`. Used time = `nowMs - turn_started_at` clamped
at ≥ 0. Fischer increment paid to the **mover only on a legal move that did
not flag**. Correspondence controls (`per_move_ms > 0`) reset the mover's
bank to the allowance per move. Untimed (`initialMs 0`, `mode 'none'`) banks
stay 0 and never flag — a zero bank with untimed is normal, do not flag it.

Recreate `lib/clock.test.ts` (the tests were deleted with the old
`game.test.ts` rewrite — the full original test list lives in the old history;
key cases to restore: increment paid to mover only; flagger gets no increment;
move exactly at zero flags; 1 ms inside passes; negative elapsed never grants
free time; correspondence refreshes allowance every move; per-move overrun
flags; untimed never flags). Port them from git history:
`git show ad03507:game.test.ts` inside the nested repo shows the old suite.

**Play page time-control picker**: reuse `lib/time-controls.ts` presets.
Suggested exposed subset: `1+0, 3+0, 3+2, 5+0, 5+3, 10+0, 10+5, 15+10` plus
`untimed` — filter by `TIME_CONTROLS` id list. The component picks `TimeControl`
object; play page owns a `ClockFields` state and ticks `now` with
`setInterval(500ms)` while `status === 'playing'`.

### 7.7 Cookie storage (`lib/local-user.ts`) — to write

```ts
const DAY = 86400;
function readNamespacedJSON(name): unknown[]   // [] on garbage/absent
function writeCookie(name, value) { document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`; }
export type AnalysisEntry = {...as §1 schema};
export function listAnalyses(): AnalysisEntry[];
export function rememberAnalyses(entry, opts?): void;  // dedupe by id, cap 12, newest first
export function loadAnalysisPgn(id): string | null;      // from `arbiter:g:<id>`
export function rememberProfile(username, name?): void;  // cap 8
export function listProfiles(): {username, name?, ts}[];
```

Guards: every read wrapped in try/catch (cookies rot; JSON.parse throws);
writes happen only in event handlers (client). Every array insert maps into a
new array and re-encodes. **Cookie budget check** before storing a PGN: skip
when `encodeURIComponent(pgn).length > 3200` and set `stored: false` on the
entry (history then shows it as a record the player can't reopen — label the
UI "details only").

Test file `lib/local-user.test.ts` is awkward (needs `document`); a light
approach: extract the pure parts (`cap`, `dedupe`, `encode`) into exported
functions and test those; cookie I/O stays untested (document why in a
comment).

### 7.8 Chess.com proxy — `app/api/chesscom/[username]/route.ts` — to write

```ts
// app/api/chesscom/[username]/route.ts
import { NextResponse } from 'next/server';
```

`GET /api/chesscom/<username>?limit=60&months=2`

- Validate username: `/^[A-Za-z][A-Za-z0-9_-]{1,31}$/` (Chess.com usernames
  are letters/digits/underline/dash, ≤32 chars; lowercase before API call).
- **Chess.com REQUIRES a User-Agent header** or it 403s:
  `fetch(url, { headers: { 'User-Agent': 'Arbiter Analysis Site (github.com/vivo6810/Chess-analyzer)' } })`.
- Endpoint 1 — profile:
  `https://api.chess.com/pub/player/${u}` → reads
  `name`, `username`, `avatar`, `joined`, `last_online`,
  `chess_bullet.last.rating`, `chess_blitz.last.rating`,
  `chess_rapid.last.rating`, `chess_daily.last.rating`.
- Endpoint 2 — archive discovery:
  `https://api.chess.com/pub/player/${u}/games/archives` → array of monthly
  URLs; **iterate newest-first**, stop when `limit` games collected or
  `months` months consumed (cap months at 6 to protect latency).
- Endpoint 3 — month:
  `https://api.chess.com/pub/player/${u}/games/${yyyy}/${mm}` →
  `{ games: [...] }`. For each game:
  - skip `rules !== 'chess'` variants (chess960 has its own openings table).
  - read `end_time` (unix), `time_class` ('bullet'|'blitz'|'rapid'|'daily'),
    `time_control` (seconds-limit string), `rated`, `pgn` (full PGN text),
    `white: {username, rating, result}`, `black: {...}`.
  - map results: winner-side strings — winner 'w' if
    `white.result === 'win'`; draw = both results are draw-ish
    ('agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timeforfeit' —
    treat this known set as the draw family);
    map to `'1-0' | '0-1' | '1/2-1/2'`.
  - keep `white.rating`, `black.rating` (the "game rating" the user wants to
    show in the header of the analyzer).
- Cache: `fetch(url, { headers, next: { revalidate: 300 } })` — modules may be
  revalidated; chess.com is strict about rate limits.
- Errors map to JSX-friendly JSON payloads:
  - profile 404 → `NextResponse.json({ error: 'No profile named "<u>" on Chess.com.' }, { status: 404 })`
  - no games in window → 200 with empty list (the UI shows "no games in the
    last N months").
  - upstream 4xx/5xx → 502 with `{ error: 'Chess.com was unreachable just now.' }`.
  - everything passes `try/catch` — never let a route handler throw raw.
- **No auth, no cookies, no DB** in this route. It is public data.
- Optional: `export const revalidate = 300;` at module top (route-level cache).

### 7.9 `components/game-replay.tsx` — exists; apply these edits

- Rename/type: props become
  ```ts
  type ReplayProps = {
    gameId: string;            // was number (DB id). Used for aria-labels only.
    startFen: string;
    moves: ReviewMove[];       // ReviewMove = { san; uci; fen; clk?: number } — update the type too
    result: string | null;
    pgn: string | null;        // original text, for the Export button
    whiteClock?: number[];     // optional: per-ply remaining seconds (built by analysers or play)
    blackClock?: number[];
  };
  ```
- The old header shows players via links to DB-backed `/players/<name>`,
  DELETE that link text and instead show two `<h3>` names + when Chess.com
  metadata is present (`whiteRating` / `blackRating` as new optional props —
  pass them from `/analysis`).
- Replace the Export anchor (`/api/games/${gameId}/pgn`) with:
  ```ts
  if (!pgn) return null;
  const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  // <a href={url} download={`${white}-vs-${black}.pgn`}>Export PGN</a>
  // remember revokeObjectURL on cleanup or create once per render via useMemo
  ```
- Move list: next to each `{index}. san` badge, when `moves[i].clk` exists,
  show `m:ss` (format helper exists nowhere — write tiny `formatClockSeconds`
  in the review component or `lib/time-format.ts`; keep pure + testable).
- Keep the exploration branch, keyboard stepping, promotion dialog, captured
  trays **exactly as they are** (they are tested manually and polished).

### 7.10 `components/game-review.tsx` — exists; extend carefully

Current flow (do not disturb): positions array from fens; for each it calls
`useEngine().analyse(fen, depth=12)`; computes `loss` from position-before vs
position-after eval; `classifyMove(loss, {onlyMove, matchesBestMove})`;
`accuracyFromLoss(avg, count)` for both sides (filters by mover); rating
estimate via `ratingFromAccuracy`.

Additions (this is the "scoreboard like Chess.com"):

1. Pass `sacrifice: detectSacrifice(positions[index + 1], bestNext)` into
   `classifyMove` (you know the position after the mover's move and the
   opponent's best move there from the collected engine data). Read §7.3.
2. NEW section `Analytics panel` (rendered once run finished):
   - **Verdict tally segmented bar** per player: excellent/brilliant/best/
     inaccuracy/mistake/blunder counts with the chip colors from
     `VERDICT_STYLE`.
   - **Eval graph**: SVG polyline over plies; x = ply, y = clampWhiteCp(-500..500)
     scaled to 0..1 where 0.5 = equal. One zero-line. Two labels: white gains
     up, black gains down — but the curve is ONE white-relative series. Add
     `viewBox="0 0 {n} 100"` and `preserveAspectRatio="none"` so it stretches.
     Mark the current ply with a vertical line from `selectedPly`.
   - **Clock graph** (only when `clk` present): same SVG skeleton, y = seconds
     remaining after each ply (both colors as two series). Also compute and
     show `average time per move` per color — the "approximate time per move"
     the user asked for at the bottom. When `clk` is absent show a quiet
     "this game has no clock record".
   - Accuracy numbers + estimated strength per color, already computed, just
     surface them with headings.
3. Keep the run/stop/cancel button set; disable while running; respect
   `controlled` prop pattern (`selectedPly`/`onSelectPly`) that the replay uses
   today.

Use the labels from §1 verbatim —
do not invent different wording ("inexact" is what the user asked to call what
the table calls inaccuracy).

### 7.11 `/play` page — `app/play/page.tsx` — to write

One `'use client'` file. State machine: `idle → playing → finished`.
Renders three columns on lg (`board | move list | setup panel`), collapsing to
stack.

Setup panel (visible in `idle`):
- **Engine level**: buttons 1..8 from §7.4 (default Level 3).
- **Side**: White / Black / random — when Black, flip board and the engine
  (playing White) makes the first move on "Start".
- **Time control**: chips from `TIME_CONTROLS` subset (§7.6).
- **Start game** button.

Playing state:
- `game` `Chess` instance in a ref; one state mirror `fen` rerender.
- Interactions **as the board allows**: use the same react-chessboard patterns
  as `game-replay.tsx` (squareStyles, onSquareClick, onPieceDrop,
  promotion dialog — copy that block; react-chessboard v5 Option API).
- On legal user move: `applyMove` semantics replaced by (no DB):
  settle the clock via `settleClock(bank, mover, now, control)`; check flag ⇒
  finish; `chess.move()…` (or `{from,to,promotion}`); evaluate
  `evaluatePosition`; record `{ san, uci, fen, mover, clkRemaining }` into a
  moves list state (this is the per-move time record the user asked for).
- Then **engine's turn**: `await analyse(fen, level.depth)`; chaos wobble
  (§7.4); build `{from, to, promotion}` from UCI; settle their clock; append.
  Prevent double-submit with a `thinking` flag.
- Clock UI: two big tiles (exists as a style in the old `game-clock.tsx` —
  delete). Recreate minimal: active board side margin clock, tabular-nums,
  `formatClock(ms)` style from `lib/time-controls.ts` (`formatClock`,
  `formatAllowance` are exported there — read them, reuse).
- Keyboard/no-op: while running, pressing Start is a no-op; on flag: finish.
- On `evaluatePosition` non-null or flag → `finished`.
- Finished panel: result banner + **"Analyse this game"** button:
  ```ts
  sessionStorage.setItem('arbiter:handoff-pgn', renderPgn(headers, moves, result));
  router.push('/analysis');
  ```
  `/analysis` consumes that key ONCE on mount (read + remove) (§7.12). Also
  call `rememberAnalysis({source:'play', ...})` from §7.7.
- **No server involvement.** The played game never leaves the browser unless
  the user pushes Analyse (which also stays client-side).

### 7.12 `/analysis` page — `app/analysis/page.tsx` — to write

One `'use client'` file. Two tabs at the top (buttons, `aria-selected`):
**Chess.com** and **PGN**. `useSearchParams` prefill `?u=username`.

- **On mount**: read + remove `sessionStorage['arbiter:handoff-pgn']`; if
  present, switch to the PGN tab, set `pgn` state, auto-parse and show the
  board (the "handoff" from /play).
- **Chess.com tab**: username field → fetch
  `/api/chesscom/${encodeURIComponent(username)}`; while loading, skeleton
  rows; on error, the payload's `error` message in a styled alert. On success:
  - rememberProfile(username, payload.profile.name) (§7.7);
  - show profile card: avatar, name, ratings chips (bullet/blitz/rapid/daily),
    joined date;
  - list of games (newest first): date, opponent, player's result color dot,
    `time_class` badge, both ratings. Each row remembers its `pgn` **in
    component state** (do NOT re-fetch on click).
  - Click a game → `parsePgn(game.pgn)` (throws → styled error) → remember
    Analysis entry (with `profile: username`) → Render
    `<GameReplay ... pgn={game.pgn} moves from ParsedGame.moves ...>` +
    header (names incl. the per-game ratings as `whiteRating`/`blackRating`
    props from §7.9, `result`, opening, `UTCDate`).
- **PGN tab**: textarea + file input (`accept=".pgn,.txt"`) + example button.
  Parse with `parsePgn`; on error show `error.message` verbatim. If exactly 1
  game → show it. If more → vertical list "Game N — White vs Black (result)"
  chips that swap the active one into the board below. On show → remember
  Analysis entry (id from `white|black|result|first-uci` hash — write a tiny
  stable `analysisId` helper in `local-user.ts`).
- **The board area** reuses `<GameReplay>` (§7.9) + its engine/review side.
  Analysis entries remember after first successful parse, not before.
- Keep the page free of any navigation to deleted routes.
- **The "loading" label on the review button is by design** (WASM boot) — the
  user sees it per the pattern in `use-engine`.

### 7.13 `/profile` page — `app/profile/page.tsx` — to write

One `'use client'` file. Enter (or select from cookie) a Chess.com username →

1. Fetch `/api/chesscom/${username}?limit=100&months=3` (reuse route, bigger
   cap; if empty, message). rememberProfile.
2. **Mode rating graph**: from `profile.chess_*` last + best values is
   insufficient — Chess.com pub API has ratings-over-time at
   `/pub/player/{u}/ratings?wall=...`? It does NOT — the public endpoint that
   exists is `/pub/player/{u}` (static) and per-month games (which carry
   `white.rating` per game — the actual per-game rating). Build the Elo
   graph **from the games themselves**: x = date, y = the user's rating in
   that game (they may be white or black — pick the seat matching the
   username, case-insensitive), one polyline per `time_class` mode (a legend
   with chips). SVG like §7.10 eval graph.
3. **Aggregate verdict report**: for performance, run a **light engine pass**:
   depth 8 instead of 12, and a **cap of ~20 games per click** with a visible
   progress bar (reuse the review's progress logic). Use `useEngine` once for
   everything (queue positions sequentially — same promise pattern). Verdict
   counting via `classifyMove` (+`detectSacrifice`).
4. Output cards: blunder/mistake/inaccuracy/excellent/brilliant counts (and,
   from §7.10 helpers, per-mode accuracy averages). "Most mistakes happen by
   move 15" is NOT required — keep phase cut simple: early (≤10), middle
   (11–30), late (31+): show a tiny 3-bucket bar per side.
   Openings aggregation: from `openings.ts`, count ECO names per game; top 5.
5. Profile history (cookie list) is rendered as chips — click = re-run.

This page is the heaviest computation in the app. It must:
- disable re-run while running;
- show a progress bar;
- abort engine work if the user navigates away (cancel via the existing
  `analyses` abort patterns — check `useEngine` cleanup: it terminates the
  worker on unmount, so un-mounting is safe);
- cap total time (e.g. max 20 games × ~60 plies × depth 8 in browser ≈ fine).

### 7.14 Landing, header, footer, layout — edits specified

**`app/page.tsx`**: keep ONLY the `<section>` labelled `Hero` (top) and the
`<NotationMarquee />` under it. Delete: the "The room" band section with bento
cards 01–05 (this is what the user's screenshot showed), and the "How it works"
section. Update copy to the new product (no tournaments, no accounts):

```
h1 stays "Your chess, on the record."
p → "Play a game against Stockfish at eight levels, or pull any Chess.com
player's games, and Arbiter reviews every move: brilliant through blunder,
accuracy, the clock they kept, and a graph of the engine's eye."
CTA 1 → href="/play", label "Play the engine"
CTA 2 → href="/analysis", label "Analyze a game"
foot-line → "No account · everything in your browser"
```

**`components/site-header.tsx`**: NAV becomes exactly:
```ts
const NAV: GooeyNavItem[] = [
  { label: 'Play', href: '/play' },
  { label: 'Analyze', href: '/analysis' },
  { label: 'Profile', href: '/profile' },
];
```
Remove the `AccountChip` import + usage. Nothing else changes (the mobile
menu, scrim, theme toggle all stay).

**`components/site-footer.tsx`**: columns →
`Play: [{Play the engine, /play}]`, `Study: [{Analyze a game, /analysis},
{Profile report, /profile}]`. Copy: "No accounts, no servers — your games and
your profiles live in your browser."

**`app/layout.tsx`**: metadata →
`title: 'Arbiter — play the engine, analyze any game'`,
`description: 'Chess.com-fetch or PGN into a brutally honest review: brilliant to blunder, accuracy and the clock, with Stockfish levels to play against.'`
Keep `Geist` fonts, the theme script, and the data-scroll-behavior attribute.

---

## 8. Deletion checklist (exact paths)

`git rm` each of these (they are inside `chess_tournament/`, op via the nested
repo):

```
app/login/page.tsx
app/register/page.tsx
app/players/page.tsx
app/players/[username]/page.tsx
app/players/[username]/games/page.tsx
app/leaderboard/page.tsx
app/tournaments/page.tsx
app/tournaments/[slug]/page.tsx
app/games/[id]/page.tsx
app/games/[id]/analysis/page.tsx
app/import/page.tsx
app/api/auth/login/route.ts
app/api/auth/register/route.ts
app/api/auth/logout/route.ts
app/api/auth/me/route.ts
app/api/challenges/route.ts
app/api/challenges/[id]/route.ts
app/api/games/[id]/move/route.ts
app/api/games/[id]/route.ts
app/api/games/[id]/action/route.ts
app/api/games/[id]/pgn/route.ts
app/api/import/route.ts
lib/db.ts
lib/service.ts
lib/service-error.ts
lib/auth.ts
lib/password.ts
lib/admin.ts
lib/api.ts
lib/profiles.ts
lib/challenge.ts
lib/pairing.ts
lib/rating.ts
lib/username.ts
lib/import-pgn.ts
lib/import-pgn.test.ts
components/auth-form.tsx
components/account-chip.tsx
components/game-board.tsx
components/challenge-board.tsx
components/game-clock.tsx
components/game-result.tsx
components/confetti.tsx
components/counter/Counter.tsx     (uses counter folder — delete the folder if empty)
Dockerfile
scripts/smoke-test.sh              (rewrite, see §10)
```

Also `lib/time-controls.test.ts`? **No — KEEP** (`time-controls.ts` stays for
Play). Same for `lib/clock.ts`. After deletion run:

```bash
grep -rn "db'" lib components app | grep -v node_modules   # no leftovers
grep -rn "@/lib/db\|service\b\|@/lib/service" app components lib | head
```

Then fix any straggler import (the deletions above cover the ones that exist).

---

## 9. Config edits (exact)

1. **`next.config.ts`** — remove `serverExternalPackages: ['libsql']` (its
   comment too; nothing server-side is native anymore). KEEP
   `allowedDevOrigins` (update the hostname when the preview host changes —
   the current value in the file matches the current VM; if the auth is not
   needed by then, this line is harmless).
2. **`package.json`** — remove `"libsql": "^0.5.29"` from dependencies. **Keep
   `engines.node >= 22.13.0`**. No other dependency changes; `chess.js`,
   `react-chessboard`, `next`, `react`, `react-dom`stay.
3. **No `vercel.json`** was created; the app is auto-detected at the repo
   root. If you add one, `framework: "nextjs"` only.
4. **`.gitignore`** — already ignores `.vercel/`, `node_modules/`,
   `data/` artifacts; leave it.

---

## 10. Docs and scripts to update

- **This file** stays at the top and keeps growing when decisions change.
- **`CHANGES.md`** — append (do not delete history) a section
  `## cookie-only rewrite (`YYYY-MM-DD`)` describing: DB/auth removal, three
  route nav, chess.com proxy, brilliant, clocks/time analytics, Vercel envs
  now unnecessary (**list what is gone**: `TURSO_*`, `SQLITE_DRIVER`,
  `DATABASE_PATH` — tell the user to remove them from the Vercel dashboard).
- **`scripts/smoke-test.sh`** — rewrite to the new surface: `GET /` 200;
  `GET /play` 200; `GET /analysis` 200; `GET /profile` 200;
  `GET /api/chesscom/hikaru` 200 **or 502** (network flakiness allowed, skip
  if offline); engine asset `GET /engine/stockfish-19-lite-single.js` 200.
  Keep the same shell style (set -euo pipefail, a `step` helper).
- **`package.json`** scripts: `test` = `node --test`; keep `typecheck`.

---

## 11. Verification pipeline

Run, in this order, before every commit:

```bash
npm test          # every *.test.ts green
npm run typecheck # clean
npm run build     # Next production build succeeds
npm run dev &     # then curl the routes from §10 (smoke script does this)
```

Manual-analytic checks (browser-panel, no automation tools in this
environment): pick a real chess.com username (e.g. `hikaru`), verify games
load, ratings render, a review runs, verdict chips color correctly, the eval
graph draws, per-move `/clk` times appear in the move list, and the Play page
plays at Level 1 (slow, wobbly) vs Level 6 (sharp but noticeably slower than search-time depth), the clock ticks, and
"Analyse this game" ends up on `/analysis` with the board loaded.

---

## 12. Commit + GitHub push procedure (exact commands)

Commit messages here are **sentence case, imperative, no prefix** —
see `git log`. Model:

```
Remove the accounts and the database, and rebuild around analysis
```

Body (2–6 lines) explains WHY. End with:

```
🤖 Generated with Codebuff
Co-Authored-By: Codebuff <noreply@codebuff.com>
```

**Commit flow:**

```bash
cd chess_tournament
git add -A
git status                     # LOOK. No node_modules, no .vercel, no data/*.db
git commit -m "$(cat <<'EOF'
<subject>

<why lines>

🤖 Generated with Codebuff
Co-Authored-By: Codebuff <noreply@codebuff.com>
EOF
)"
```

Then mirror-push to `Chess-analyzer` (connected repo) **exactly per §2**.
After pushing, verify via `git fetch` in the worktree:

```bash
git log --oneline FETCH_HEAD -4        # your new commit on top of old main
git ls-tree FETCH_HEAD | head -5       # package.json + next.config.ts at ROOT
```

Never push elsewhere. Never `--force`.

---

## 13. Trap list — every way a careless agent breaks this app

1. **`Document` during SSR.** Cookies/screensizing — guard with
   `typeof window === 'undefined'` or read inside `useEffect`. A text mismatch
   makes React re-hydrate everything and flash.
2. **The engine worker path** is `/engine/stockfish-19-lite-single.js` —
   anything else (devserver rewrite, bundling, trailing slash) kills the
   whole product silently (the panel says "Unavailable").
3. **`new Worker('/engine/...')`** — must be same-origin absolute path.
4. **chess.js imports of square lookups** with `as never` — read
   `game-replay.tsx` for the idiom; casting args blindly hides runtime traps.
5. **react-chessboard v5 Options API** — camel-cased (`squareStyles`,
   `onPieceDrop`), position is FEN string, `boardOrientation` values are
   `'white' | 'black'` strings (not booleans). v4 code will not compile.
6. **Next 16 dynamic params are Promises** — `params: Promise<{ id: string }>`,
   `await params` (see `games/[id]/analysis/page.tsx` before it is deleted).
7. **node --test + `.ts` extension imports.** Importing `./pgn` (extensionless)
   in a test breaks under Node's TS stripping; keep `.ts`.
8. **Tailwind v4 tokens** — classes like `bg-canvas` resolve via
   `@theme` in `app/globals.css`. A class like `text-brutal` that was never
   defined silently does nothing (no error).
9. **The clock never flags untimed games.** There is a test for exactly that
   ("an untimed game survives an arbitrarily long think").
10. **Cookie size.** Per-cookie ~4 KB browser budget. Compact PGNs only; fail
    soft to `stored: false`.
11. **Chess.com rate limits.** Server route "`revalidate: 300`"; the UI shows
    the cached copy happily; if you hammer it with profile-report runs, batch
    — the report should reuse one fetch result, not re-fetch per metric.
12. **GitHub dual-repo sync** — follow §2 exactly; in particular the mirror
    tree must place the nested tree at ROOT (`read-tree --prefix=` cannot do
    that alone: the new-commit tree IS the nested tree) and HEAD
    restoration is mandatory.
13. **Never re-import the deleted DB layer** (`lib/db.ts`, `service.ts`). If
    an old type is handy, inline it; the past is not to be resurrected.
14. **Never store user data in the server filesystem.** There is no persistent
    filesystem on Vercel. `data/` writes were the old app's habit. Nothing
    writes to disk anymore — not even caches.
15. **`useSearchParams`** needs `<Suspense>` in Next when used in a server
    component; in our client page with `'use client'` the existing pattern in
    the app is safe. If you see a build error about Suspense, read Next docs
    — do not hack around it.

---

## 14. Future work pool (park your ideas here, in order)

1. **PGN sharing**: copy-paste button of the current position as FEN, plus a
   "share analysis" URL that spends the full PGN in `?pgn=` (URL-encoded,
   length-capped 8 KB) for link sharing without cookies.
2. **More verdict context on the eval graph**: hovering a ply shows the
   verdict chip inline.
3. **Opening explorer from profile data**: for each ECO name the user plays,
   link out to the opening's wiki or a quiet explainer.
4. **Engine strength labels**: after enough Level-N games, label the bot
   with a measured estimate rather than a bare "Level".
5. **Accessibility pass on the board** (spoken move announcements) — the
   keyboard stepping exists; a `aria-live` region reading `san` per ply is
   the natural next step.
6. **Randomized "sparring" handicap**: engine drops a piece at Level 1–3.

---

### Closing words

If something in this file contradicts the code, **do not silently "fix" either
side** — stop, update this file, get the next agent aligned. This document is
the contract; the code is its implementation.
