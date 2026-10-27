import type { MoveVerdict } from '@/lib/review';

/**
 * Verdict badges — the eight engine classifications as the review brief's
 * glyph set: a filled circle with the verdict symbol cut out in the canvas
 * colour, so small glyphs read as stamped rather than drawn.
 *
 * The engine's vocabulary is the spine: brilliant / best / excellent / good /
 * inaccuracy / mistake / blunder / forced. Each verdict borrows the brief's
 * closest glyph (!! !, ★, ?!, ?, ??, —) and its colour token, so a badge never
 * invents a classification the engine did not produce.
 */

/* Colour the circle internally via `currentColor`; consumers set it with the
   matching `--color-move-*` token (see VERDICT_COLOR and the CSS classes). */
export const VERDICT_COLOR: Record<MoveVerdict, string> = {
  brilliant: 'var(--color-move-brilliant)',
  best: 'var(--color-move-best)',
  excellent: 'var(--color-move-critical)',
  good: 'var(--color-move-book)',
  inaccuracy: 'var(--color-move-inaccuracy)',
  mistake: 'var(--color-move-mistake)',
  blunder: 'var(--color-move-blunder)',
  forced: 'var(--color-line-strong)',
};

export const VERDICT_LABEL: Record<MoveVerdict, string> = {
  brilliant: 'brilliant',
  best: 'best',
  excellent: 'excellent',
  good: 'good',
  inaccuracy: 'inaccuracy',
  mistake: 'mistake',
  blunder: 'blunder',
  forced: 'forced',
};

/* Cutout geometry per verdict, on a 24×24 grid. Keys are symbol ids. */
const CUTOUT: Record<MoveVerdict, string[]> = {
  brilliant: [
    'M9.5 6.5H11.5L11.1 13.5H9.9L9.5 6.5ZM10.5 17.5C9.8 17.5 9.3 17 9.3 16.3C9.3 15.6 9.8 15.1 10.5 15.1C11.2 15.1 11.7 15.6 11.7 16.3C11.7 17 11.2 17.5 10.5 17.5Z',
    'M13.5 6.5H15.5L15.1 13.5H13.9L13.5 6.5ZM14.5 17.5C13.8 17.5 13.3 17 13.3 16.3C13.3 15.6 13.8 15.1 14.5 15.1C15.2 15.1 15.7 15.6 15.7 16.3C15.7 17 15.2 17.5 14.5 17.5Z',
  ],
  best: [
    'M12 6.2L13.75 10.1L18 10.55L14.8 13.4L15.7 17.6L12 15.4L8.3 17.6L9.2 13.4L6 10.55L10.25 10.1L12 6.2Z',
  ],
  excellent: [
    'M10.8 6.2H13.2L12.7 13.8H11.3L10.8 6.2ZM12 18C11.1 18 10.5 17.4 10.5 16.5C10.5 15.6 11.1 15 12 15C12.9 15 13.5 15.6 13.5 16.5C13.5 17.4 12.9 18 12 18Z',
  ],
  good: [
    'M6.5 8.2C6.5 7.6 7.0 7.2 7.6 7.3C9.1 7.5 10.5 8.1 11.3 8.8V16.6C10.4 15.9 8.9 15.4 7.4 15.2C6.8 15.1 6.5 14.7 6.5 14.1V8.2ZM17.5 8.2C17.5 7.6 17.0 7.2 16.4 7.3C14.9 7.5 13.5 8.1 12.7 8.8V16.6C13.6 15.9 15.1 15.4 16.6 15.2C17.2 15.1 17.5 14.7 17.5 14.1V8.2Z',
  ],
  inaccuracy: [
    'M8.6 14.0V13.5C8.6 12.5 9.2 12.0 9.8 11.5C10.4 11.0 10.8 10.6 10.8 9.9C10.8 9.1 10.2 8.5 9.3 8.5C8.4 8.5 7.8 9.0 7.5 9.8L6.0 9.2C6.4 7.8 7.6 7.0 9.4 7.0C11.3 7.0 12.6 8.0 12.6 9.8C12.6 10.9 12.0 11.7 11.2 12.3C10.5 12.7 10.2 13.1 10.2 14.0H8.6ZM9.4 17.4C8.7 17.4 8.2 16.9 8.2 16.2C8.2 15.5 8.7 15.0 9.4 15.0C10.1 15.0 10.6 15.5 10.6 16.2C10.6 16.9 10.1 17.4 9.4 17.4Z',
    'M14.3 7.0H16.5L16.1 14.0H14.7L14.3 7.0ZM15.4 17.4C14.7 17.4 14.2 16.9 14.2 16.2C14.2 15.5 14.7 15.0 15.4 15.0C16.1 15.0 16.6 15.5 16.6 16.2C16.6 16.9 16.1 17.4 15.4 17.4Z',
  ],
  mistake: [
    'M11.9 14.2V13.6C11.9 12.4 12.6 11.8 13.4 11.2C14.1 10.7 14.6 10.2 14.6 9.3C14.6 8.3 13.8 7.6 12.6 7.6C11.5 7.6 10.7 8.2 10.4 9.2L8.5 8.5C9.0 6.8 10.5 5.8 12.7 5.8C15.1 5.8 16.8 7.1 16.8 9.2C16.8 10.6 16.0 11.5 15.0 12.2C14.2 12.8 13.8 13.2 13.8 14.2H11.9ZM12.8 18.2C12.0 18.2 11.4 17.6 11.4 16.8C11.4 16.0 12.0 15.4 12.8 15.4C13.6 15.4 14.2 16.0 14.2 16.8C14.2 17.6 13.6 18.2 12.8 18.2Z',
  ],
  blunder: [
    'M8.4 14.0V13.5C8.4 12.5 9.0 12.0 9.6 11.5C10.2 11.0 10.6 10.6 10.6 9.9C10.6 9.1 10.0 8.5 9.1 8.5C8.4 8.5 7.8 9.0 7.5 9.8L6.0 9.2C6.4 7.8 7.6 7.0 9.4 7.0C11.3 7.0 12.6 8.0 12.6 9.8C12.6 10.9 12.0 11.7 11.2 12.3C10.5 12.7 10.2 13.1 10.2 14.0H8.6ZM9.4 17.4C8.7 17.4 8.2 16.9 8.2 16.2C8.2 15.5 8.7 15.0 9.4 15.0C10.1 15.0 10.6 15.5 10.6 16.2C10.6 16.9 10.1 17.4 9.4 17.4Z',
    'M14.4 14.0V13.5C14.4 12.5 15.0 12.0 15.6 11.5C16.2 11.0 16.6 10.6 16.6 9.9C16.6 9.1 16.0 8.5 15.1 8.5C14.2 8.5 13.6 9.0 13.3 9.8L11.8 9.2C12.2 7.8 13.4 7.0 15.2 7.0C17.1 7.0 18.4 8.0 18.4 9.8C18.4 10.9 17.8 11.7 17.0 12.3C16.3 12.7 16.0 13.1 16.0 14.0H14.4ZM15.2 17.4C14.5 17.4 14.0 16.9 14.0 16.2C14.0 15.5 14.5 15.0 15.2 15.0C15.9 15.0 16.4 15.5 16.4 16.2C16.4 16.9 15.9 17.4 15.2 17.4Z',
  ],
  /* Forced moves get the dash: no alternative existed to grade. */
  forced: [
    'M7.5 10.75H16.5C17.05 10.75 17.5 11.2 17.5 11.75V12.25C17.5 12.8 17.05 13.25 16.5 13.25H7.5C6.95 13.25 6.5 12.8 6.5 12.25V11.75C6.5 11.2 6.95 10.75 7.5 10.75Z',
  ],
};

const VERDICTS = Object.keys(CUTOUT) as MoveVerdict[];

/**
 * The sprite: one hidden SVG with every verdict glyph as a <symbol>, rendered
 * once per page (layout). Badges reference the symbols by id, so N badges
 * share the same geometry instead of repeating it in the DOM.
 */
export function VerdictSprite() {
  return (
    <svg aria-hidden="true" focusable="false" style={{ display: 'none' }}>
      {VERDICTS.map((verdict) => (
        <symbol key={verdict} id={`arb-verdict-${verdict}`} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          {CUTOUT[verdict].map((d) => (
            <path key={d} d={d} fill="var(--color-canvas, #0f0f12)" />
          ))}
        </symbol>
      ))}
    </svg>
  );
}

/** The verdict's glyph alone — inherits `currentColor`. */
export function VerdictGlyph({ verdict, className }: { verdict: MoveVerdict; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" focusable="false">
      <use href={`#arb-verdict-${verdict}`} />
    </svg>
  );
}

/** Matte move-list pill: glyph + engine label, tinted per verdict. */
export function VerdictPill({ verdict }: { verdict: MoveVerdict }) {
  return (
    <span className={`verdict-pill verdict-pill--${verdict}`}>
      <VerdictGlyph verdict={verdict} />
      <span>{VERDICT_LABEL[verdict]}</span>
    </span>
  );
}

/**
 * The circular board-overlay token: a dark-ringed disc the badge rides inside
 * (move-list supers, next to clocks, anywhere a square would not fit).
 */
export function VerdictToken({ verdict }: { verdict: MoveVerdict }) {
  return (
    <span
      className={`verdict-token verdict-color--${verdict}`}
      title={VERDICT_LABEL[verdict]}
      aria-label={VERDICT_LABEL[verdict]}
    >
      <VerdictGlyph verdict={verdict} />
    </span>
  );
}
