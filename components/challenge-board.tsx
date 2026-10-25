'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { GROUPED_TIME_CONTROLS } from '@/lib/time-controls';

export type ChallengeRow = {
  id: number;
  challenger_name: string;
  opponent_name: string;
  time_control: string;
  status: string;
  game_id: number | null;
};

/**
 * The challenge desk.
 *
 * Two halves of the same conversation: what is waiting for *you* (accept or
 * decline) and what you sent (with a way to see whether it landed). Buttons
 * call the API directly and let the page re-fetch itself, the same pattern the
 * board and the forms already use.
 */
export default function ChallengeBoard({
  viewer,
  incoming,
  outgoing,
  challengeable,
}: {
  /** `null` when a guest is looking — the desk then shows only the sign-in path. */
  viewer: number | null;
  incoming: ChallengeRow[];
  outgoing: ChallengeRow[];
  challengeable: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (id: number, action: 'accept' | 'decline') => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/challenges/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }).catch(() => null);

    if (!response || !response.ok) {
      const payload = await response?.json().catch(() => null);
      setError(payload?.error ?? 'The answer did not send.');
      setBusy(false);
      return;
    }

    if (action === 'accept') {
      const payload = (await response.json()) as { gameId?: number };
      router.push(payload.gameId ? `/games/${payload.gameId}` : '/');
      router.refresh();
      return;
    }

    setBusy(false);
    router.refresh();
  };

  const send = async (timeControl: string) => {
    if (!challengeable) return;
    setBusy(true);
    setError(null);
    const response = await fetch('/api/challenges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opponent: challengeable, timeControl }),
    }).catch(() => null);

    if (!response || !response.ok) {
      const payload = await response?.json().catch(() => null);
      setError(payload?.error ?? 'The challenge did not send.');
      setBusy(false);
      return;
    }

    setBusy(false);
    router.refresh();
  };

  return (
    <section className="border-2 border-ink bg-surface shadow-brut">
      <header className="border-b-2 border-ink px-5 py-3">
        <h2 className="text-[13px] font-bold text-ink">Challenges</h2>
      </header>

      <div className="space-y-5 px-5 py-4">
        {!viewer ? (
          <p className="text-[13px] text-muted">
            <a href="/login" className="font-bold text-ink underline underline-offset-2">
              Sign in
            </a>{' '}
            to play, challenge and keep a record.
          </p>
        ) : null}

        {incoming.length > 0 ? (
          <div>
            <p className="field-label">Waiting for your answer</p>
            <ul className="mt-2 space-y-2">
              {incoming.map((challenge) => (
                <li
                  key={challenge.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-2 border-line bg-bone px-3 py-2"
                >
                  <span className="text-[13px] text-ink">
                    {challenge.challenger_name}{' '}
                    <span className="font-mono text-[11px] text-muted">{challenge.time_control}</span>
                  </span>
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void answer(challenge.id, 'accept')}
                      className="press min-h-9 border-2 border-ink bg-accent px-3 py-1.5 text-[12px] font-bold text-on-accent shadow-brut-sm disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void answer(challenge.id, 'decline')}
                      className="press min-h-9 border-2 border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {outgoing.length > 0 ? (
          <div>
            <p className="field-label">You sent</p>
            <ul className="mt-2 space-y-1.5">
              {outgoing.map((challenge) => (
                <li key={challenge.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-ink">
                    {challenge.opponent_name}{' '}
                    <span className="font-mono text-[11px] text-muted">{challenge.time_control}</span>
                  </span>
                  {challenge.status === 'pending' ? (
                    <span className="badge bg-draw-bg text-draw-fg">standing</span>
                  ) : challenge.status === 'accepted' && challenge.game_id ? (
                    <a
                      href={`/games/${challenge.game_id}`}
                      className="badge bg-info-bg text-info-fg hover:underline"
                    >
                      open board →
                    </a>
                  ) : (
                    <span className="badge bg-bone text-muted">{challenge.status}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {challengeable && viewer ? (
          <div>
            <p className="field-label">Challenge {challengeable}</p>
            <div className="mt-2 flex gap-2">
              <select
                id="challenge-time-control"
                defaultValue="5+3"
                className="field"
                aria-label="Time control"
              >
                {GROUPED_TIME_CONTROLS.map((group) => (
                  <optgroup key={group.category} label={group.label}>
                    {group.controls.map((control) => (
                      <option key={control.id} value={control.id}>
                        {control.label} — {group.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const select = document.getElementById('challenge-time-control') as HTMLSelectElement | null;
                  void send(select?.value ?? '5+3');
                }}
                className="press flex-none border-2 border-ink bg-accent px-4 py-2 text-[13px] font-bold text-on-accent shadow-brut-sm disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
            <p className="mt-1.5 text-[12px] text-muted">
              They answer from their own profile. Accepted, the board opens at once.
            </p>
          </div>
        ) : null}

        {viewer && incoming.length === 0 && outgoing.length === 0 && !challengeable ? (
          <p className="text-[13px] text-muted">No challenges standing — send one from a player's profile.</p>
        ) : null}

        {error ? (
          <p className="border-2 border-loss-fg bg-loss-bg px-3 py-2 text-[12px] font-medium text-loss-fg">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
