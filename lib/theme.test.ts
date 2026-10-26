import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * The single site palette is kept contrast-safe so cards, labels, and clocks
 * remain legible across every route.
 */

const ROOT = new URL('../app/globals.css', import.meta.url);
const css = readFileSync(ROOT, 'utf8');

const block = (pattern: RegExp, label: string) => {
  const match = css.match(pattern);
  assert.ok(match, `could not find the ${label} colour block in globals.css`);
  return match[1];
};

const paletteBlock = block(/@theme static \{([\s\S]*?)\n\}/, 'site');

/** All declared `--color-*` names, ignoring non-colour tokens like fonts. */
const allKeys = (source: string) =>
  new Set(Array.from(source.matchAll(/(--color-[a-z-]+)\s*:/g), (m) => m[1]));

/** Only the tokens whose value is a hex colour we can measure. */
const hexes = (source: string) => {
  const found: Record<string, string> = {};
  for (const match of source.matchAll(/(--color-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    found[match[1]] = match[2].toLowerCase();
  }
  return found;
};

const palette = hexes(paletteBlock);

/* ── WCAG relative luminance and contrast ─────────────────────── */

const channel = (srgb: number) =>
  srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;

const luminance = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const round = (n: number) => Math.round(n * 100) / 100;

/* Thresholds. Body-copy pairs hold AAA (7:1); captions hold the 4.5:1 that
   the old #787774 muted grey failed at 4.4:1. */
const AA = 4.5;
const AAA = 7;

const PALETTES = [
  { name: 'site', tokens: palette },
] as const;

/* ── Structure ────────────────────────────────────────────────── */

test('the site uses the Tournament Club palette without a theme toggle', () => {
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const header = readFileSync(new URL('../components/site-header.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\[data-theme=['"]dark['"]\]/);
  assert.doesNotMatch(layout, /themeScript|data-theme/);
  assert.doesNotMatch(header, /ThemeToggle|Dark mode/);
  assert.equal(palette['--color-canvas'], '#161512');
  assert.equal(palette['--color-surface'], '#211f1c');
  assert.equal(palette['--color-accent'], '#629924');
  assert.equal(palette['--color-board-light'], '#d8d9c5');
  assert.equal(palette['--color-board-dark'], '#4e6e58');
});

test('every declared colour is a plain six-digit hex', () => {
  for (const { name, tokens } of PALETTES) {
    for (const key of allKeys(paletteBlock)) {
      const value = tokens[key];
      assert.ok(value, `${name}: ${key} is not a hex colour (got ${value ?? 'nothing parseable'})`);
    }
  }
});

/* ── Contrast ─────────────────────────────────────────────────── */

test('ivory body copy clears AAA on the canvas', () => {
  for (const { name, tokens } of PALETTES) {
    assert.ok(
      contrast(tokens['--color-ink'], tokens['--color-canvas']) >= AAA,
      `${name}: ink on canvas is ${round(contrast(tokens['--color-ink'], tokens['--color-canvas']))}:1, needs ${AAA}:1`,
    );
    assert.ok(
      contrast(tokens['--color-ink-soft'], tokens['--color-canvas']) >= AAA,
      `${name}: ink-soft on canvas is ${round(contrast(tokens['--color-ink-soft'], tokens['--color-canvas']))}:1, needs ${AAA}:1`,
    );
  }
});

test('muted captions clear AA on the canvas', () => {
  for (const { name, tokens } of PALETTES) {
    const ratio = contrast(tokens['--color-muted'], tokens['--color-canvas']);
    assert.ok(
      ratio >= AA,
      `${name}: muted on canvas is ${round(ratio)}:1, needs ${AA}:1. This is the grey used for 12-13px captions, so a miss here is unreadable rather than merely soft.`,
    );
  }
});

test('the solid button keeps its label readable', () => {
  for (const { name, tokens } of PALETTES) {
    const ratio = contrast(tokens['--color-on-solid'], tokens['--color-solid']);
    assert.ok(
      ratio >= AAA,
      `${name}: on-solid on solid is ${round(ratio)}:1, needs ${AAA}:1.`,
    );
  }
});

test('the accent is readable in both directions', () => {
  for (const { name, tokens } of PALETTES) {
    /* Label on the button, and the accent used as text on the page (links,
       the focus ring's neighbours). A complement is chosen for contrast, so
       it has to survive being measured as a foreground too. */
    const onButton = contrast(tokens['--color-on-accent'], tokens['--color-accent']);
    const onPage = contrast(tokens['--color-accent'], tokens['--color-canvas']);

    assert.ok(
      onButton >= AA,
      `${name}: on-accent on accent is ${round(onButton)}:1, needs ${AA}:1`,
    );
    assert.ok(
      onPage >= AA,
      `${name}: accent on canvas is ${round(onPage)}:1, needs ${AA}:1 — the accent is used for links and the focus ring, not only as a fill`,
    );
  }
});

test('the landing page is limited to the hero and notation marquee', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.equal((page.match(/<section\b/g) ?? []).length, 1);
  assert.match(page, /<NotationMarquee\s*\/>/);
  assert.match(page, /href="\/play"/);
  assert.match(page, /href="\/analysis"/);
  assert.doesNotMatch(page, /className="band\b|className="slab\b/);
});

test('the glass panels separate from the band behind them', () => {
  /* A frosted panel is only a panel if you can see its edge. The first
     version mixed 8% white over the band, which composited to 1.28:1 —
     invisible, so the whole section read as one black rectangle. */
  const block = css.match(/\.glass--on-ink \{([\s\S]*?)\n  \}/);
  assert.ok(block, 'could not find the .glass--on-ink block in globals.css');

  const pct = block![1].match(/#ffffff (\d+)%/);
  assert.ok(pct, '.glass--on-ink must tint with a literal white percentage');
  const fill = Number(pct![1]) / 100;

  const composite = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const base = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return 255 * fill + base * 255 * (1 - fill);
    });
    return `#${channels.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
  };

  for (const { name, tokens } of PALETTES) {
    const band = tokens['--color-band'];
    const card = composite(band);
    const ratio = contrast(card, band);
    assert.ok(
      ratio >= 1.4,
      `${name}: glass over the band is ${round(ratio)}:1 — raise the tint in .glass--on-ink until the panel has an edge`,
    );
  }
});

test('the band and its inverted slab stay readable', () => {
  for (const { name, tokens } of PALETTES) {
    assert.ok(
      contrast(tokens['--color-band-fg'], tokens['--color-band']) >= AAA,
      `${name}: band-fg on band is ${round(contrast(tokens['--color-band-fg'], tokens['--color-band']))}:1, needs ${AAA}:1`,
    );
    assert.ok(
      contrast(tokens['--color-band-slab-ink'], tokens['--color-band-slab']) >= AAA,
      `${name}: slab ink on slab is ${round(
        contrast(tokens['--color-band-slab-ink'], tokens['--color-band-slab']),
      )}:1, needs ${AAA}:1`,
    );
    assert.ok(
      contrast(tokens['--color-band-slab'], tokens['--color-band']) >= 7,
      `${name}: the slab is only ${round(contrast(tokens['--color-band-slab'], tokens['--color-band']))}:1 against the band, so the inverted cell stops reading as a separate object`,
    );
  }
});

test('cards and borders separate from the surface they sit on', () => {
  /* A deliberately low bar. Soft borders are the house style, so this is not
     asking for a 3:1 outline — it exists to stop a border being set to
     something indistinguishable from the surface behind it, which is how the
     interface ends up looking like one flat sheet of paper. */
  for (const { name, tokens } of PALETTES) {
    const ratio = contrast(tokens['--color-line'], tokens['--color-surface']);
    assert.ok(
      ratio >= 1.25,
      `${name}: border is only ${round(ratio)}:1 against the surface, needs 1.25:1`,
    );
  }
});

test('the tournament-green squares are far enough apart to read as a board', () => {
  for (const { name, tokens } of PALETTES) {
    const ratio = contrast(tokens['--color-board-light'], tokens['--color-board-dark']);
    assert.ok(
      ratio >= 2,
      `${name}: board squares are only ${round(ratio)}:1 apart, needs 2:1.`,
    );
  }
});

test('the board separates from the dark page behind it', () => {
  for (const { name, tokens } of PALETTES) {
    const ratio = contrast(tokens['--color-board-dark'], tokens['--color-canvas']);
    assert.ok(
      ratio >= 1.5,
      `${name}: darkest square is ${round(ratio)}:1 against the canvas, needs 1.5:1.`,
    );
  }
});

/* There is deliberately no piece-contrast assertion any more. The app used to
   ship its own SVG piece set for the decorative boards, and this file defended
   the outline that kept a white piece visible on a light square. Those boards
   are gone, `react-chessboard` draws the pieces on the two boards that remain,
   and its glyphs are not ours to colour — so the tokens those assertions
   measured were deleted and the assertions with them. The square colours they
   sat on are still measured above. */

test('the split-flap clock stays readable against the site palette', () => {
  for (const { name, tokens } of PALETTES) {
    const board = tokens['--color-flap-bg'];

    const active = contrast(tokens['--color-flap-fg'], board);
    assert.ok(
      active >= AAA,
      `${name}: the running clock is ${round(active)}:1 on its own board, needs ${AAA}:1`,
    );

    // The idle side is dimmer on purpose, but its digits are large text and a
    // clock you cannot read is worse than no clock.
    const idle = contrast(tokens['--color-flap-idle'], board);
    assert.ok(idle >= 3, `${name}: the idle clock is ${round(idle)}:1, needs 3:1`);

    const alert = contrast(tokens['--color-flap-alert'], board);
    assert.ok(alert >= 4.5, `${name}: the time-pressure colour is ${round(alert)}:1, needs 4.5:1`);

    // And the display itself must separate from the page it is bolted to.
    const object = contrast(board, tokens['--color-canvas']);
    assert.ok(
      object >= 1.25,
      `${name}: the clock is only ${round(object)}:1 against the canvas, so it reads as a smudge rather than an object`,
    );
  }
});

test('the offset shadow is visible against the page', () => {
  /* A neobrutalist surface is a border plus an offset shadow. If the shadow is
     the same value as the canvas it disappears and every card loses its depth
     — which is what a black shadow does on a near-black page. */
  for (const { name, tokens } of PALETTES) {
    const ratio = contrast(tokens['--color-brut'], tokens['--color-canvas']);
    assert.ok(
      ratio >= 1.3,
      `${name}: the offset shadow is ${round(ratio)}:1 against the canvas, needs 1.3:1`,
    );
  }
});

test('status badges carry readable text', () => {
  const PAIRS = [
    ['win', '--color-win-fg', '--color-win-bg'],
    ['loss', '--color-loss-fg', '--color-loss-bg'],
    ['draw', '--color-draw-fg', '--color-draw-bg'],
    ['scheduled', '--color-info-fg', '--color-info-bg'],
  ] as const;

  for (const { name, tokens } of PALETTES) {
    for (const [label, fg, bg] of PAIRS) {
      const ratio = contrast(tokens[fg], tokens[bg]);
      assert.ok(
        ratio >= AA,
        `${name}: ${label} badge is ${round(ratio)}:1, needs ${AA}:1.`,
      );
    }
  }
});
