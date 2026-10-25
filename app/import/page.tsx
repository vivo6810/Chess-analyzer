'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Outcome = {
  imported: { id: number; white: string; black: string; result: string }[];
  skipped: number;
};

const SAMPLE = `[Event "Casual game"]
[White "Blackburne"]
[Black "Morphy"]
[Result "0-1"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5
6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nd4 1/2-1/2`;

/**
 * The importer.
 *
 * A textarea you can paste into and a file input that fills it — one path, so
 * the validation story and the error messages are identical either way. The
 * server says exactly what landed and what was already on file; a failure
 * names the first move it could not play.
 */
export default function ImportPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  const [pgn, setPgn] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: { user: unknown }) => setSignedIn(Boolean(payload.user)))
      .catch(() => setSignedIn(false));
  }, []);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      setPgn(text.slice(0, 200_000)); // A truncated file is better than a frozen tab.
      setError(null);
    } catch {
      setError('The file could not be read.');
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setOutcome(null);

    const response = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pgn }),
    }).catch(() => null);

    if (!response || !response.ok) {
      const payload = await response?.json().catch(() => null);
      setError(payload?.error ?? 'The import did not go through.');
      setBusy(false);
      return;
    }

    const payload = (await response.json()) as Outcome;
    setOutcome(payload);
    if (payload.imported.length > 0) {
      setPgn('');
      router.refresh();
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <header className="max-w-2xl">
        <h1 className="font-extrabold text-[36px] leading-[1.12] tracking-[-0.03em] text-ink">Import a PGN</h1>
        <p className="mt-3 text-[15px] text-muted">
          Paste one game or a whole file. Every move is validated, the games are filed under your
          account, and an identical game already on file is skipped — never duplicated.
        </p>
      </header>

      {signedIn === false ? (
        <div className="mt-8 max-w-md rounded-none border-2 border-line bg-surface shadow-brut px-6 py-7">
          <p className="text-[15px] font-bold text-ink">You need an account to import.</p>
          <p className="mt-1.5 text-[13px] text-muted">
            Imported games belong to someone. Sign in and they land in your record.
          </p>
          <div className="mt-5 flex gap-3">
            <Link
              href="/login?next=/import"
              className="press border-2 border-ink bg-accent px-4 py-2.5 text-[13px] font-bold text-on-accent shadow-brut-sm"
            >
              Sign in
            </Link>
            <Link href="/register" className="press border-2 border-line-strong px-4 py-2.5 text-[13px] font-medium text-ink hover:bg-bone">
              Create an account
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8">
          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="press border-2 border-line-strong bg-surface px-4 py-2.5 text-[13px] font-medium text-ink hover:bg-bone"
            >
              Choose a .pgn file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pgn,.txt,text/plain"
              className="hidden"
              onChange={(event) => void readFile(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => setPgn(SAMPLE)}
              className="press border-2 border-line-strong bg-surface px-4 py-2.5 text-[13px] font-medium text-ink hover:bg-bone"
            >
              Fill in an example
            </button>
          </div>

          <label className="mt-4 block">
            <span className="field-label">PGN text</span>
            <textarea
              value={pgn}
              onChange={(event) => setPgn(event.target.value)}
              rows={12}
              spellCheck={false}
              required
              placeholder="Paste the PGN here — headers optional, moves required"
              className="field mt-1.5 font-mono text-[13px] leading-relaxed"
            />
          </label>

          {error ? (
            <p role="alert" className="mt-4 border-2 border-loss-fg bg-loss-bg px-3 py-2 text-[13px] font-medium text-loss-fg">
              {error}
            </p>
          ) : null}

          {outcome ? (
            <div className="mt-4 border-2 border-ink bg-surface px-5 py-4 shadow-brut-sm">
              <p className="text-[13px] font-bold text-ink">
                Filed {outcome.imported.length} game{outcome.imported.length === 1 ? '' : 's'}
                {outcome.skipped > 0 ? ` · skipped ${outcome.skipped} already on file` : ''}
              </p>
              {outcome.imported.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {outcome.imported.map((game) => (
                    <li key={game.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="font-mono text-ink">#{game.id}</span>
                      <span className="text-ink">
                        {game.white} — {game.black}
                      </span>
                      <span className="font-mono text-muted">{game.result}</span>
                      <Link href={`/games/${game.id}/analysis`} className="badge bg-info-bg text-info-fg hover:underline">
                        Analyse →
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy || !pgn.trim()}
            className="press mt-6 border-2 border-ink bg-accent px-5 py-3 text-[14px] font-bold text-on-accent shadow-brut disabled:opacity-50"
          >
            {busy ? 'Validating…' : 'Import games'}
          </button>
        </form>
      )}
    </div>
  );
}
