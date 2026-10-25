import Link from 'next/link';

import Counter from '@/components/counter/Counter';
import HeroArena from '@/components/hero-arena';
import NotationMarquee from '@/components/notation-marquee';
import { CATEGORY_LABEL, TIME_CONTROLS } from '@/lib/time-controls';

/* Every board on this page is either the real app or a fact about it. There
   are no sample players, no invented ratings and no illustrative score line:
   if a value here is not derived from `lib/` it does not belong on the page. */
const RECORD_RULES = [
  { rule: 'Legal, verified', detail: 'Every move is validated by chess.js on the server.' },
  { rule: 'Named openings', detail: 'The ECO table labels what the moves actually reached.' },
  { rule: 'Engine over each game', detail: 'Stockfish grades every ply once the game is over.' },
];

const CATEGORIES = Array.from(new Set(TIME_CONTROLS.map((control) => control.category)));

/**
 * The landing page.
 *
 * A **server component**, deliberately: every heading, paragraph and link on
 * this page is in the HTML that arrives from the server, and the only
 * JavaScript it ships for itself is the four animated leaves — the arena, the
 * odometer, the folding word and the proximity type. Everything a reader (or a
 * reader that does not run scripts) needs is already text.
 *
 * The composition is built on one rule: **no two adjacent surfaces share a
 * value.** Sand page, ink band, cream cards, flat panels. Nothing here is a
 * gradient any more: the page reads as ink, sand and paper, which is both the
 * brutalist brief and a lot easier to look at than four blurred blooms.
 */
export default function LandingPage() {
  return (
    <div>
      {/* ═══ Hero ═══════════════════════════════════════════════════
          The one place the page can be loud. Copy left, a real board right. */}
      <section className="relative border-b-2 border-ink bg-canvas">
        <div className="relative grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="relative px-5 py-12 sm:px-10 sm:py-14 lg:py-24 lg:pr-24">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
              Profiles · history · analysis
            </p>

            <h1 className="mt-6 max-w-[15ch] text-[clamp(2.7rem,6.4vw,5rem)] leading-[0.94] font-extrabold tracking-[-0.045em] text-ink">
              Your chess, on the record.
            </h1>

            <p className="mt-7 max-w-[42ch] text-[17px] leading-relaxed text-ink-soft">
              Play a challenged game or import a PGN, and Arbiter keeps the record: a profile with
              your openings and results, a history you can filter, and Stockfish over every
              finished game.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 sm:gap-4">
              <Link
                href="/players"
                className="press border-2 border-ink bg-accent px-6 py-3.5 text-[15px] font-bold text-on-accent shadow-brut"
              >
                Find a player
              </Link>
              <Link
                href="/import"
                className="press border-2 border-ink bg-surface px-6 py-3.5 text-[15px] font-bold text-ink shadow-brut"
              >
                Import a PGN
              </Link>
            </div>

            <p className="mt-6 font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
              No account needed to watch · {TIME_CONTROLS.length} time controls
            </p>
          </div>

          {/* A hard rule, not a wedge: the split is a border on the layout
              grid, so it lands at the same place at every viewport width
              without an absolutely-positioned shape to drift. */}
          <div className="relative border-t-2 border-ink px-5 py-10 sm:px-10 sm:py-12 lg:border-t-0 lg:border-l-2 lg:py-16 lg:pr-8 lg:pl-16">
            <HeroArena />
          </div>
        </div>
      </section>

      <NotationMarquee />

      {/* ═══ The room ═══════════════════════════════════════════════
          An ink band. This is the tonal anchor the page was missing: after a
          sand hero, one full-bleed near-black section makes both of them read
          as deliberate. The bento grid lives here, on flat panels. */}
      <section className="band relative border-b-2 border-ink bg-band text-band-fg">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-6 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-band-fg/25 pb-6">
            <h2 className="max-w-[26ch] text-[clamp(1.6rem,3.4vw,2.3rem)] font-extrabold tracking-[-0.035em] text-band-fg">
              Profiles, history and review, run by the record.
            </h2>
            <p className="font-mono text-[11px] tracking-[0.14em] text-band-fg/80 uppercase">
              What Arbiter does per game
            </p>
          </div>

          {/* ── Bento ───────────────────────────────────────────────
              Six cells, three tracks, uneven spans. Deliberately not a row of
              equal cards: the shapes carry the hierarchy, so the copy does not
              have to. */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {/* 1 — the record claim, widest cell */}
            <article className="panel-on-ink flex flex-col justify-between gap-6 p-6 sm:p-7 sm:col-span-2 lg:col-span-3">
              <div>
                <p className="font-mono text-[11px] tracking-[0.16em] text-band-fg/80 uppercase">
                  01 — The record
                </p>
                <h3 className="mt-3 text-[26px] font-extrabold tracking-[-0.03em] text-band-fg">
                  Every game, nameable and filterable.
                </h3>
                <p className="mt-3 max-w-[42ch] text-[14px] leading-relaxed text-band-fg/80">
                  Result, colour, opening, move count and the clock that enforced it. Filter your
                  history any way you played.
                </p>
              </div>

              <ul className="flex flex-col gap-2.5">
                {RECORD_RULES.map((item) => (
                  <li
                    key={item.rule}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-band-fg/35 pt-2.5"
                  >
                    <span className="font-mono text-[11px] tracking-[0.08em] text-band-fg uppercase">
                      {item.rule}
                    </span>
                    <span className="text-[12px] text-band-fg/80">{item.detail}</span>
                  </li>
                ))}
              </ul>
            </article>

            {/* 2 — the odometer. A real number from the app's own table. */}
            <article className="panel-on-ink flex flex-col justify-between gap-4 p-6 sm:p-7 sm:col-span-2 lg:col-span-3">
              <div>
                <p className="font-mono text-[11px] tracking-[0.16em] text-band-fg/80 uppercase">
                  02 — Time controls
                </p>
                <div className="mt-2 flex items-end gap-3">
                  <Counter
                    value={TIME_CONTROLS.length}
                    fontSize="clamp(3.4rem,7vw,5rem)"
                    fontWeight={800}
                    textColor="var(--color-band-fg)"
                    duration={1.1}
                    bounce={0.28}
                    stagger={0.06}
                    fade={0.22}
                  />
                  <span className="mb-3 font-mono text-[12px] tracking-[0.14em] text-band-fg/80 uppercase">
                    presets
                  </span>
                </div>
                <p className="mt-2 max-w-[38ch] text-[14px] leading-relaxed text-band-fg/80">
                  From one minute with no increment to a day per move. The bank and the
                  Fischer bonus are enforced on the server, per game.
                </p>
              </div>

              <ul className="flex flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <li
                    key={category}
                    className="border border-band-fg/35 px-2 py-1 font-mono text-[11px] text-band-fg/80"
                  >
                    {CATEGORY_LABEL[category]}
                  </li>
                ))}
              </ul>
            </article>

            {/* 3 */}
            <article className="panel-on-ink flex flex-col gap-3 p-6 sm:col-span-1 lg:col-span-2">
              <p className="font-mono text-[11px] tracking-[0.16em] text-band-fg/80 uppercase">
                03 — Profiles
              </p>
              <h3 className="text-[19px] font-extrabold tracking-[-0.02em] text-band-fg">
                Numbers that were earned.
              </h3>
              <p className="text-[13px] leading-relaxed text-band-fg/80">
                Ratings are derived from results, game by game. No stat on a profile exists that
                the record did not produce.
              </p>
            </article>

            {/* 4 */}
            <article className="panel-on-ink flex flex-col gap-3 p-6 sm:col-span-1 lg:col-span-2">
              <p className="font-mono text-[11px] tracking-[0.16em] text-band-fg/80 uppercase">
                04 — Review
              </p>
              <h3 className="text-[19px] font-extrabold tracking-[-0.02em] text-band-fg">
                Stockfish on every game.
              </h3>
              <p className="text-[13px] leading-relaxed text-band-fg/80">
                Verdicts, accuracy and the eval graph, ply by ply. Blunders are marked where they
                were played.
              </p>
            </article>

            {/* 5 — the one inverted cell. A cream slab on the ink band, so the
                eye lands where the action is. */}
            <article className="slab flex flex-col justify-between gap-4 p-6 lg:col-span-2">
              <div>
                <p className="font-mono text-[11px] tracking-[0.16em] text-band-slab-ink/75 uppercase">
                  05 — Your move
                </p>
                <h3 className="mt-2 text-[19px] font-extrabold tracking-[-0.02em] text-band-slab-ink">
                  Challenge someone to a board.
                </h3>
              </div>
              <Link
                href="/players"
                className="press inline-flex items-center justify-between gap-3 border-2 border-band-slab-ink bg-accent px-4 py-3 text-[13px] font-bold text-on-accent"
              >
                Open the players
                <span aria-hidden="true">→</span>
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* ═══ How it works ══════════════════════════════════════════════════
          Three cards, hard borders, offset shadows — the neobrutalist half of
          the brief, kept to the part of the page that is pure instruction. */}
      <section className="bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-[20ch] text-[clamp(1.7rem,3.4vw,2.6rem)] font-extrabold tracking-[-0.035em] text-ink">
              Three steps to a game worth keeping.
            </h2>
            <Link
              href="/analysis"
              className="press border-2 border-ink bg-surface px-4 py-2.5 text-[13px] font-bold text-ink shadow-brut-sm"
            >
              Try the review board
            </Link>
          </div>

          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                step: '01',
                title: 'Sign in and challenge',
                body: 'Pick a player from the directory, send a challenge, and they answer from their own profile.',
              },
              {
                step: '02',
                title: 'Or import a PGN',
                body: 'Paste a game or a file. Every move is validated; duplicates are skipped, not duplicated.',
              },
              {
                step: '03',
                title: 'Open the analysis',
                body: 'Step through the board, copy the FEN, export the PGN — and press Review for the engine\u2019s read.',
              },
            ].map((item) => (
              <li
                key={item.step}
                className="step-card flex flex-col gap-3 border-2 border-ink bg-surface p-7 shadow-brut"
              >
                <span className="step-card__index font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
                  {item.step}
                </span>
                <h3 className="text-[20px] font-extrabold tracking-[-0.02em] text-ink">
                  {item.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-ink-soft">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
