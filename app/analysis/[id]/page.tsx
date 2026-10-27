'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import GameReplay from '@/components/game-replay';
import { loadAnalysisPgn } from '@/lib/local-user';
import { parsePgn, PgnError, type ParsedGame } from '@/lib/pgn';

type LoadedGame = {
  parsed: ParsedGame;
  pgn: string;
  whiteRating: number | null;
  blackRating: number | null;
};

export default function DedicatedAnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<LoadedGame | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let pgn = loadAnalysisPgn(id);
    if (!pgn) {
      try {
        pgn = sessionStorage.getItem(`arbiter:analysis-pgn:${id}`);
      } catch {
        setError('This game is not available in this browser.');
        return;
      }
    }
    if (!pgn) {
      setError('This game is not available in this browser.');
      return;
    }

    try {
      const parsed = parsePgn(pgn)[0];
      const query = new URLSearchParams(window.location.search);
      const rating = (name: string) => {
        const value = Number(query.get(name));
        return Number.isFinite(value) && value > 0 ? value : null;
      };
      setGame({
        parsed,
        pgn,
        whiteRating: rating('whiteRating'),
        blackRating: rating('blackRating'),
      });
    } catch (caught) {
      setError(caught instanceof PgnError ? caught.message : 'This game could not be loaded.');
    }
  }, [id]);

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 sm:py-7">
      <Link href="/analysis" className="text-[12px] font-bold text-ink underline decoration-line-strong underline-offset-4 hover:text-accent">
        ← All games
      </Link>
      {error ? (
        <p role="alert" className="mt-6 border-2 border-loss-fg bg-loss-bg px-4 py-3 text-[13px] text-loss-fg">{error}</p>
      ) : game ? (
        <>
          <header className="my-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-4">
            <div>
              <p className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
                {game.parsed.opening ?? 'Game analysis'}{game.parsed.playedAt ? ` · ${game.parsed.playedAt}` : ''}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-ink">{game.parsed.white} vs {game.parsed.black}</h1>
            </div>
            <p className="font-mono text-sm font-bold text-ink">{game.parsed.result}</p>
          </header>
          <GameReplay
            gameId={id}
            startFen={game.parsed.startFen}
            moves={game.parsed.moves}
            result={game.parsed.result}
            pgn={game.pgn}
            white={game.parsed.white}
            black={game.parsed.black}
            whiteRating={game.whiteRating}
            blackRating={game.blackRating}
            timeControl={game.parsed.timeControl}
          />
        </>
      ) : (
        <p className="mt-6 text-[13px] text-muted">Loading game…</p>
      )}
    </div>
  );
}
