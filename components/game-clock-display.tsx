'use client';

import SplitFlapText from '@/components/split-flap-text/SplitFlapText';
import { formatClockTiles } from '@/lib/time-controls';

export default function GameClockDisplay({
  milliseconds,
  label,
  active = false,
}: {
  milliseconds: number | null;
  label: string;
  active?: boolean;
}) {
  if (milliseconds == null) {
    return <span className="font-mono text-xl font-bold text-muted" aria-label={`${label} clock unavailable`}>—</span>;
  }

  const remaining = Math.max(0, milliseconds);
  const urgent = remaining < 10_000;
  const spokenTime = Math.floor(remaining / 60_000) > 0
    ? `${Math.floor(remaining / 60_000)} minutes ${Math.floor(remaining / 1000) % 60} seconds`
    : `${(remaining / 1000).toFixed(1)} seconds`;

  return (
    <div
      role="timer"
      aria-label={`${label}: ${spokenTime} remaining`}
      className={`game-clock-display ${active ? 'game-clock-display--active' : ''} ${urgent ? 'game-clock-display--urgent' : ''}`}
    >
      <SplitFlapText
        text={formatClockTiles(remaining)}
        charset="0123456789:"
        flipsPerChar={0}
        tileColor="var(--color-flap-bg)"
        textColor={urgent ? 'var(--color-flap-alert)' : 'var(--color-flap-fg)'}
        tileRadius={0}
        gap="0.12em"
        fontSize="clamp(18px, 4vw, 28px)"
        padTo={5}
        intro={false}
        glare={0.08}
        depth={0.7}
        className="game-clock-display__face"
      />
    </div>
  );
}
