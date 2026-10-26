'use client';

import { defaultPieces } from 'react-chessboard';

import GameClockDisplay from '@/components/game-clock-display';
import type { Side } from '@/lib/chess-ui';

export default function PlayerBoardRow({
  side,
  name,
  rating,
  captures,
  material,
  clock,
  active,
}: {
  side: Side;
  name: string;
  rating?: number | null;
  captures: string[];
  material: number;
  clock: number | null;
  active: boolean;
}) {
  const label = side === 'w' ? 'White' : 'Black';

  return (
    <div className={`flex min-w-0 items-center justify-between gap-2 border-2 px-2.5 py-2 sm:gap-4 sm:px-4 ${active ? 'border-ink bg-bone' : 'border-line bg-surface'}`}>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h3 className="max-w-full truncate text-[13px] font-bold text-ink sm:text-[15px]">{name}</h3>
          <span className="font-mono text-[10px] text-muted">{rating != null ? `${rating} · ` : ''}{label}</span>
        </div>
        <div className="mt-1 flex min-h-5 min-w-0 items-center gap-1.5">
          <span className="sr-only">{label} captured pieces</span>
          {captures.map((key, index) => {
            const Icon = defaultPieces[key];
            return (
              <span
                key={`${key}-${index}`}
                className={`captured-piece ${key[0] === 'b' ? 'captured-piece--black' : 'captured-piece--white'}`}
                aria-hidden="true"
              >
                <Icon />
              </span>
            );
          })}
          {material > 0 && (
            <span
              aria-label={`Material advantage +${material}`}
              className="ml-1 inline-flex min-h-5 items-center whitespace-nowrap bg-solid px-1.5 font-mono text-[11px] font-extrabold leading-none text-on-solid"
            >
              +{material}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-mono text-[9px] font-bold tracking-[0.08em] text-muted uppercase">{label} clock</span>
        <GameClockDisplay milliseconds={clock} label={label} active={active} />
      </div>
    </div>
  );
}
