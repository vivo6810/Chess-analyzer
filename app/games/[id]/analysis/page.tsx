import Link from 'next/link';
import { notFound } from 'next/navigation';

import GameReplay from '@/components/game-replay';
import { parseMoves } from '@/lib/db';
import { openingForMoves } from '@/lib/openings';
import { getGameWithPlayers, getTournamentById, type GameWithPlayers } from '@/lib/service';
import { describeTimeControl, getTimeControl } from '@/lib/time-controls';

export const dynamic = 'force-dynamic';

const RESULT_LABEL: Record<string, string> = {
  '1-0': '1–0',
  '0-1': '0–1',
  '1/2-1/2': '½–½',
};

const TERMINATION_LABEL: Record<string, string> = {
  checkmate: 'checkmate',
  resignation: 'resignation',
  timeout: 'on time',
  stalemate: 'stalemate',
  agreement: 'agreed draw',
  insufficient: 'insufficient material',
  repetition: 'repetition',
  'fifty-move': 'fifty-move rule',
};

function seatView(game: GameWithPlayers, side: 'white' | 'black') {
  const name = side === 'white' ? game.white_name : game.black_name;
  const userId = side === 'white' ? game.white_user_id : game.black_user_id;
  return { name: name || (side === 'white' ? 'White' : 'Black'), userId };
}

export default async function GameAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gameId = Number(id);
  if (!Number.isInteger(gameId) || gameId <= 0) notFound();

  const game = getGameWithPlayers(gameId);
  if (!game) notFound();
  if (game.status !== 'finished') notFound();

  const tournament = game.tournament_id ? getTournamentById(game.tournament_id) : null;
  const moves = parseMoves(game.moves);
  const opening = game.opening ?? openingForMoves(moves.map((move) => move.san));
  const control = getTimeControl(game.time_control);
  const white = seatView(game, 'white');
  const black = seatView(game, 'black');

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-5 space-y-3 sm:mb-8">
        <p className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
          <Link href={tournament ? `/tournaments/${tournament.slug}` : '/analysis'} className="hover:text-ink">
            {tournament ? tournament.name : 'Analysis'}
          </Link>
          {game.round_no ? ` · round ${game.round_no}, board ${game.board}` : ''}
          {' · '}
          {new Date(game.updated_at).toISOString().slice(0, 10)}
          {game.source === 'import' ? ' · imported' : ''}
        </p>

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-ink sm:text-[26px]">
            {white.userId ? (
              <Link href={`/players/${encodeURIComponent(white.name)}`} className="hover:underline">
                {white.name}
              </Link>
            ) : (
              white.name
            )}
            <span className="text-muted"> vs </span>
            {black.userId ? (
              <Link href={`/players/${encodeURIComponent(black.name)}`} className="hover:underline">
                {black.name}
              </Link>
            ) : (
              black.name
            )}
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            {game.result ? (
              <span className="badge bg-info-bg text-info-fg">
                {RESULT_LABEL[game.result] ?? game.result}
              </span>
            ) : null}
            {game.termination ? (
              <span className="badge bg-bone text-muted">
                {TERMINATION_LABEL[game.termination] ?? game.termination}
              </span>
            ) : null}
            <span className="badge bg-bone text-muted">{describeTimeControl(control)}</span>
            {opening ? <span className="badge bg-bone text-muted">{opening}</span> : null}
          </div>
        </div>
      </header>

      <GameReplay gameId={game.id} startFen={game.start_fen} result={game.result} moves={moves} />
    </div>
  );
}
