# INIT — the complete handoff. Read every word before touching anything.

**Audience:** you are an AI agent taking over this repo. You may think you know
how to code, but this codebase has rules, traps and a frozen product spec. This
file teaches you all of them. If you violate a rule written here, the previous
agent's work (all of it, committed or not) will fight you and you will lose.

**Rule zero:** the repository root is the application root. Make changes here;
do not recreate a `chess_tournament/` wrapper. Never rewrite history or
force-push. Everything in this file is in the user's language: English.

---

## Table of contents

1. The product, frozen
2. Repository and deployment
3. Implementation status
4. Environment and commands
5. How code is written in this repo (style law)
6. Architecture map — what survives, what dies, what is new
7. Module-by-module build instructions
   - 7.1 `lib/pgn.ts` (done — read to understand)
   - 7.2 `lib/game.ts` (done)
   - 7.3 Verdicts + brilliant detection (`lib/review.ts` — implemented)
   - 7.4 Engine levels (`lib/engine-levels.ts` — implemented)
   - 7.5 The engine worker (`lib/use-engine.ts` — exists, do not break)
   - 7.6 Clock (`lib/clock.ts` — exists, keep and test)
   - 7.7 Cookie storage (`lib/local-user.ts` — implemented)
   - 7.8 Chess.com proxy (`app/api/chesscom/[username]/route.ts` — implemented)
   - 7.9 `components/game-replay.tsx` (exists; small edits)
   - 7.10 `components/game-review.tsx` (exists; extend carefully)
   - 7.11 `/play` page (implemented)
   - 7.12 `/analysis` page (implemented)
   - 7.13 `/profile` page (implemented)
   - 7.14 Landing, header, footer, layout (implemented)
8. Deletion checklist (exact paths)
9. Config edits (exact)
10. Docs and scripts to update
11. Verification pipeline
12. Commit and publish
13. Trap list — every way a careless agent breaks this app
14. Future work pool

---

## 1. The product, frozen

These decisions were made with the user and are **not yours to change**. When a
requirement here conflicts with something you find in old code, this list wins —
the old code that contradicts it is to be deleted (§8).

### Conversation context and latest visual direction

This record consolidates the user's requests across the conversation so future
work preserves the full product and UX context instead of treating the latest
message as a standalone change.

**Current palette request (latest): Option B — Grandmaster Slate.** The site
previously applied Option C (Tournament Club); that is what the current code
still implements. The user has now asked that the handoff record be updated to
say Option B is the desired palette. Record this as the next visual direction;
do not claim Option B is already implemented until the CSS tokens and visible
surfaces have actually been changed and verified.

Option B values from the user's palette brief:

| Role | Option B value |
| --- | --- |
| Main background | `#0B0F17` — Midnight Navy |
| Panels / move list | `#151C28` — Dark Slate |
| Hover / active row | `#1E293B` — Steel Blue-Gray |
| Borders / dividers | `#283548` — Muted Slate Line |
| Primary text | `#F8FAFC` — Ice White |
| Secondary text | `#94A3B8` — Cool Gray |
| Primary accent | `#38BDF8` — Electric Sky |
| Secondary accent | `#818CF8` — Soft Indigo |

The user also supplied two dark-mode board choices: a slate/ash board with
light squares `#94A3B8` or `#B0B3B8`, dark squares `#334155` or `#47494D`, and
a translucent gold last-move highlight; or the warmer tournament alternative
with light `#D8D9C5` and dark `#4E6E58`. The pasted CSS example was explicitly
Option A, so it is not the requested Option B implementation. Move-quality
colors from the same brief are brilliant cyan `#26C6DA`, great/critical steel
blue `#5C8BB0`, best emerald `#66BB6A`, book bronze `#A88865`, inaccuracy amber
`#FBC02D`, mistake orange `#FB8C00`, and blunder crimson `#E53935`.
Evaluation-bar colors requested were off-white `#E2E8F0` for White advantage
and `#27272A` for Black advantage.

The user-provided attachment also included conceptual round SVG icons and
compact matte move-list badges for brilliant, great, best, book, inaccuracy,
mistake, missed win, and blunder. The design notes requested dark cutout
symbols, subtle color-tinted fills/borders, and optional board-corner badges.
Treat these as reference/design guidance, not as a request to paste an
unreviewed 319-line HTML/CSS/SVG demo into production. Reuse the existing move
verdict UI and implement only the needed symbols/classes if separately asked.

**Conversation request history and constraints**

1. Use `INIT.md` as the primary product/data source, inspect the two requested
   files and the repository, identify what remains, then implement the missing
   website features.
2. Test the site with a player other than Hikaru. Correct Magnus Carlsen's
   world-number-one profile/rating handling and investigate a recent-games
   cutoff that hid games played as late as October 23.
3. Provide a live local preview for the user to test. Selecting a game for
   analysis must open a dedicated page for only that game, not require
   scrolling through unrelated analysis.
4. The user wanted to report issues incrementally and asked to wait before
   doing larger work; update `INIT.md` and `CHANGES.md` with reported issues.
5. Improve contrast, particularly in the then-dark mode. Replace expanded
   verdict details with compact counts and a “Show more” affordance; selecting
   any move should seek the board to that position. Show a superscript quality
   indicator on every board move.
6. Replace “inexact” with “inaccuracy”. Add separate rating graphs by game
   mode to profile analysis. Show favorite openings as bulleted names without
   ECO prefixes such as “C4”.
7. Put clocks on the board and use the user's supplied split-flap animation.
   Arrange each player's name, captured pieces, positive material lead, and
   clock alongside their side of the board. Make the board fit smaller screens.
   Omit unnecessary instructional/capture text, including empty captures and
   zero material leads. Material advantage should appear as `+N`, not a prose
   label.
8. Add click-to-select legal piece movement with destination markers that
   respect chess rules such as pins. At game end, rotate the losing king
   90 degrees to the right, show a red translucent ripple for a player loss,
   and confetti for a player win.
9. The user explicitly approved starting the board/clock and responsive work,
   then asked for local preview and browser testing.
10. The user next selected Option C, Tournament Club, from the supplied
    palette options. Option C was implemented in the current code: warm
    charcoal/ivory surfaces, tournament-green action and board colors, amber
    move hints, and semantic verdict colors. The latest message changes the
    desired direction to Option B; the earlier selection must not override it.
11. Remove the exact screenshot copy: the landing tagline “No account ·
    everything in your browser”, the footer blurb about no accounts/servers
    and browser storage, the hero-board “Your move. Click a piece to see where
    it can go.” prompt, and the profile hint describing the old 20-game limit.
12. Add profile analytics for average game rating, average blunders per match,
    highest rating for every game mode, and average accuracy. Let the user
    choose a game count or enter `all` to analyze available Chess.com games.
13. Keep the user informed with a local preview and verify changes rather than
    claiming a preview is current when it serves an old build.

Current implementation state is summarized in §3 and the follow-up ledger in
§14. This context ledger captures the conversation's user requirements and
attached palette/badge direction without copying the full raw conversation or
unreviewed demo markup into this operational handoff file.

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
   inaccuracy, mistake, blunder** where **brilliant is
   reserved for sacrifices** (recipe in §7.3) — a large **eval bar** next to
   the board, a **per-move eval graph (line, zero line = equal)**, the
   **clock remaining time per move** rendered with the move list, an
   **approximate time-per-move summary at the bottom**, and the full analytics
   set: white/black accuracy, game ratings when provided (not inferred from
   accuracy), verdict tally bar.
3. **`/profile` — Profile analysis.** Enter a Chess.com username and choose a
   game count or `all`. The app runs an aggregate report over the selected
   games: average game rating, Chess.com peak rating for each game mode,
   average accuracy and blunders per match, counts per verdict, separate
   **Elo-style rating graphs for each game mode the player has played**
   (bullet/blitz/rapid/daily from Chess.com), win/draw/loss rate, favorite
   openings shown as a bulleted list of opening names without ECO codes such as
   "C4", most-blundered phase, and average centipawn loss trend. The report is
   client-computed from fetched PGNs. Profiles looked at are remembered in
   cookies.

**Landing page.** Keep the **top hero section only** (headline, sub copy, two
CTA buttons linking to `/play` and `/analysis`, `HeroArena` decorative board).
Delete the middle ink band (bento cards 01–05) and the bottom "How it works"
step cards section, completely.

**Cookie storage (final).** All "user data" = cookies, no `localStorage` for
this. The interface uses one dark Tournament Club palette with no theme toggle:
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

## 2. Repository and deployment

The connected repository is `vivo6810/Chess-analyzer`, and its root is the
Next.js application root. Vercel imports this repository directly. There is no
nested application repository, mirror-sync procedure, or `chess_tournament/`
directory in this checkout. Do not commit or publish changes unless the user
asks; never force-push.

---

## 3. Implementation status

The cookie-only product described in §1 is implemented at the repository root:
the `/play`, `/analysis`, and `/profile` pages; local cookie history; the
Chess.com proxy; engine levels and clock-aware play; PGN handoff; brilliant
sacrifice detection; replay, verdict, eval, and clock analytics. The
account/database/tournament/challenge routes and their backing modules have
been removed. `CHANGES.md` records this rewrite.

Validation at the current handoff: `npm test` passes 104 tests,
`npm run typecheck` passes, and `npm run build` succeeds. The latest browser
check confirmed the profile game-count field renders at `/profile`; the
production preview is available at `http://127.0.0.1:3001`.

---

## 4. Environment and commands

```bash
npm ci                       # if node_modules is missing
npm run typecheck            # tsc --noEmit, must be CLEAN before any commit
npm test                     # node --test, must be ALL GREEN before any commit
npm run build                # Next production build
npm run dev                  # dev server
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
   one-off colors. The app uses one dark Tournament Club palette with no theme
   toggle: warm charcoal surfaces, ivory text, tournament-green actions, and a
   muted green board with amber move hints.
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
    `setState`.

---

## 6. Architecture map

**Survive as-is (do not edit unless a spec below says so):**
`lib/openings.ts`(+`.test.ts`) — ECO table by move sequence; `lib/chess-ui.ts`
(+test) — square/target helpers; `lib/review.ts` — verdict thresholds (you'll
extend it); `lib/use-engine.ts` — worker client;
`components/gooey-nav/GooeyNav.tsx` (header);
`components/engine-panel.tsx` (fen-driven, depth 12); decorative folders
(`fold-text`, `split-flap-text`, `variable-proximity`, `notation-marquee`,
`hero-arena` — used by landing hero); `components/site-footer.tsx` (rewrite
columns, trivial); `app/globals.css` (only add, don't purge yet).

**Survive with edits:** `components/game-replay.tsx` (§7.9),
`components/game-review.tsx` (§7.10), `components/site-header.tsx` (§7.14),
`app/layout.tsx` (metadata), `lib/game.ts`/`pgn.ts`/
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

### 7.3 Verdicts + brilliant detection (`lib/review.ts`) — implemented

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

### 7.4 Engine levels (`lib/engine-levels.ts`) — implemented

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

### 7.7 Cookie storage (`lib/local-user.ts`) — implemented

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

### 7.8 Chess.com proxy — `app/api/chesscom/[username]/route.ts` — implemented

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
  `name`, `username`, `avatar`, `joined`, `last_online`.
- Endpoint 2 — current stats:
  `https://api.chess.com/pub/player/${u}/stats` → reads
  `chess_bullet.last.rating`, `chess_blitz.last.rating`,
  `chess_rapid.last.rating`, and `chess_daily.last.rating` (the profile
  endpoint itself does not reliably include those fields).
- Endpoint 3 — archive discovery:
  `https://api.chess.com/pub/player/${u}/games/archives` → array of monthly
  URLs; **iterate newest-first**, stop when `limit` games collected or
  `months` months consumed (cap months at 6 to protect latency).
- Endpoint 4 — month:
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
`accuracyFromLoss(avg, count)` for both sides (filters by mover). Do not
convert engine accuracy into an Elo estimate: a single game review cannot
reliably estimate playing strength. Show Chess.com game ratings when provided;
otherwise show that the rating is unavailable.

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
   - Accuracy numbers and actual Chess.com game ratings per color; do not
     present accuracy-derived Elo estimates. Show rating as unavailable when
     the PGN does not include rating metadata.
3. Keep the run/stop/cancel button set; disable while running; respect
   `controlled` prop pattern (`selectedPly`/`onSelectPly`) that the replay uses
   today.

Use the labels from §1 verbatim — call the verdict `inaccuracy`.

### 7.11 `/play` page — `app/play/page.tsx` — implemented

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

### 7.12 `/analysis` page — `app/analysis/page.tsx` — implemented

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

### 7.13 `/profile` page — `app/profile/page.tsx` — implemented

One `'use client'` file. Enter (or select from cookie) a Chess.com username →

1. Let the user request a positive game count or `all`; fetch newest archives
   until the count is reached, or every archive has been read. Remember the
   profile after a successful fetch.
2. Draw a separate per-mode rating graph from game ratings and show each
   mode's all-time peak from Chess.com's stats endpoint.
3. The move report analyzes every returned PGN at depth 8 using one engine
   worker and a visible progress bar. It reports average game rating, average
   player blunders per match, mean per-game estimated accuracy, verdicts,
   openings, W/D/L, and blunder phases.
4. Openings aggregation shows the top 5 as a bulleted list without ECO-code
   prefixes. Profile history (cookie list) is rendered as chips; click = re-run.

The move report can be lengthy for large or `all` requests; it must disable
re-run while running and show progress.

### 7.14 Landing, header, footer, layout — implemented

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
Remove the promotional foot-line below the CTAs.
```

**`components/site-header.tsx`**: NAV becomes exactly:
```ts
const NAV: GooeyNavItem[] = [
  { label: 'Play', href: '/play' },
  { label: 'Analyze', href: '/analysis' },
  { label: 'Profile', href: '/profile' },
];
```
Remove the `AccountChip` import + usage. Keep the mobile menu and scrim.

**`components/site-footer.tsx`**: columns →
`Play: [{Play the engine, /play}]`, `Study: [{Analyze a game, /analysis},
{Profile report, /profile}]`. Do not add a descriptive footer blurb.

**`app/layout.tsx`**: metadata →
`title: 'Arbiter — play the engine, analyze any game'`,
`description: 'Chess.com-fetch or PGN into a brutally honest review: brilliant to blunder, accuracy and the clock, with Stockfish levels to play against.'`
Keep `Geist` fonts and the data-scroll-behavior attribute.

---

## 8. Deletion checklist (completed)

The obsolete account, database, tournament, challenge, and import files below
have been removed from this checkout. Do not restore them or rerun these
deletions as implementation work.

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

## 9. Config edits (completed)

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

## 10. Docs and scripts (updated)

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

## 12. Commit and publish

The nested-repository and mirror-push procedure formerly described here does
not apply: `Chess-analyzer` itself is the connected repository and the app is
at its root. Do not commit or push unless the user requests it. If requested,
use the repository's ordinary non-interactive Git workflow and never
force-push.

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
12. **Repository layout** — the app is already at the connected repository's
    root; do not create a nested app or perform a mirror-sync HEAD dance.
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

## 14. User follow-ups and future work

User-reported follow-ups (implemented after the user authorized the fixes):

1. **Dedicated game analysis page — implemented**: selecting a Chess.com
   recent game opens its own `/analysis/[id]` page with that game's replay
   and analysis only.
2. **Tournament Club palette — implemented**: the site uses warm charcoal
   surfaces, ivory text, green actions, a muted tournament-green board, and
   semantic move-review colors. There is no theme toggle.
3. **Recent Chess.com games cutoff — implemented**:
   recent games were omitted because the proxy applied its limit before
   selecting newest archive entries. The route now traverses monthly archive
   games newest-first, then sorts and limits the result. Verified that
   Magnus Carlsen's October 23 games against Toxicmybrother appear at the top
   of the list.
4. **Analysis summary and move navigation — implemented**: verdict totals are
   compact and inline, `Show more` reveals the detailed move list, selecting
   a move seeks the board, and reviewed moves show verdict badges in the board
   move list.
5. **Verdict wording — implemented**: the full label `inaccuracy` is used.
6. **Profile rating graphs and opening list — implemented**: rating history is
   split into one graph per mode represented in recent games, and favorite
   openings are bulleted with ECO prefixes removed.
7. **Board player rows and responsive sizing — implemented**: both player areas
   around the board symmetrically. On the opponent side above the board and
   the player's side below it, show names, captured pieces, a high-contrast
   `+N` material lead only when positive, and that side's clock. Empty capture
   labels and zero material text are omitted. The board remains responsive,
   and the user-provided split-flap animation is reused for the clocks.
8. **Play-board input and game-end feedback — implemented**: selecting a
   piece shows only its legal destinations with grey markers; pinned pieces
   use chess.js legal-move rules. On a win, confetti celebrates over the board.
   On a loss, the losing king falls right and a translucent red ripple crosses
   the board. Reduced-motion preferences disable the moving overlays.
9. **Tournament Club palette — implemented, superseded by a newer palette
   request**: warm charcoal surfaces, ivory text, tournament-green actions and
   board, amber legal-move hints, and semantic review colors remain in the
   current CSS. The user has since requested Option B (Grandmaster Slate) as
   the desired palette; implementing that visual switch is still pending.
10. **Profile report metrics and range — implemented (2026-10-26)**: the
    profile page accepts a positive game count or `all`, loads newest Chess.com
    archives until that count is met, and reports average game rating, each
    mode's Chess.com peak, average player blunders per analyzed game, and
    average per-game accuracy estimate. The report analyzes all PGNs in the
    selected sample.
11. **Visible-copy cleanup — implemented (2026-10-26)**: removed the landing
    page browser tagline, the footer account/storage blurb, the hero board's
    default move prompt, and the obsolete profile hint about a 20-game cap.
12. **Option B palette direction — documented (2026-10-26)**: the user changed
    the desired palette from the previously selected Option C to Option B,
    Grandmaster Slate. Values and the supplied board/verdict/evaluation
    guidance are recorded in §1. Do not mark the palette switch implemented
    until the app is updated and validated.

Previously listed ideas:

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
