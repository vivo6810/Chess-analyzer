import { notFound } from 'next/navigation';

import GameBoard, { type GameState } from '@/components/game-board';
import { canSettleGames, getCurrentUser } from '@/lib/auth';
import { getGameWithPlayers, getTournamentById, movesOf } from '@/lib/service';
import { getTimeControl } from '@/lib/time-controls';

export const dynamic = 'force-dynamic';

import Link from 'next/link';

/** A finished game has an analysis page; the live board says so rather than
    making the visitor hunt for it. */
function FinishedGameNotice({ id }: { id: number }) {
  return (
    <p className="mb-4 border-2 border-info-fg bg-info-bg px-3 py-2 text-[13px] text-info-fg">
      This game has finished.{' '}
      <Link
        href={`/games/${id}/analysis`}
        className="font-bold underline underline-offset-2"
      >
        Open the full analysis →
      </Link>
    </p>
  );
}

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gameId = Number(id);
  if (!Number.isInteger(gameId) || gameId <= 0) notFound();

  /* One read for the game and the two names at the board — the same row the
     poll endpoint returns, assembled the same way. */
  const game = getGameWithPlayers(gameId);
  if (!game) notFound();

  const white = { name: game.white_name, user_id: game.white_user_id };
  const black = { name: game.black_name, user_id: game.black_user_id };

  const user = await getCurrentUser();
  const tournament = game.tournament_id ? getTournamentById(game.tournament_id) : null;
  /* Hosting is not playing: the position can only be changed by the two people
     it belongs to. Sandbox events are the legacy exception — a retired lab left
     boards with empty seats, and a staff account still drives both seats there. */
  const sandboxPlay = canSettleGames(user) && tournament?.sandbox === 1;
  const isSeated =
    sandboxPlay ||
    (user != null && (white?.user_id === user.id || black?.user_id === user.id));

  const initial: GameState = {
    game: {
      id: game.id,
      fen: game.fen,
      status: game.status,
      result: game.result,
      termination: game.termination,
      timeControl: getTimeControl(game.time_control),
      /* Imported PGN may begin from a tagged position; played games use the
         standard one the schema seeded. */
      startFen: game.start_fen,
      drawOffer:
        game.draw_offer_by == null
          ? null
          : game.draw_offer_by === white?.user_id
            ? 'white'
            : 'black',
      moves: movesOf(game).map((move) => ({ san: move.san, uci: move.uci, fen: move.fen })),
      white: { playerId: game.white_player_id, name: white?.name ?? 'White' },
      black: { playerId: game.black_player_id, name: black?.name ?? 'Black' },
    },
    clock: {
      whiteMs: game.white_ms,
      blackMs: game.black_ms,
      incrementMs: game.increment_ms,
      perMoveMs: game.per_move_ms,
      turnStartedAt: game.turn_started_at,
      serverNow: Date.now(),
    },
    seats: { seated: isSeated, isWhite: white?.user_id === user?.id, bothSides: sandboxPlay },
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-5 sm:mb-8">
        <p className="text-[11px] font-medium tracking-[0.08em] text-muted uppercase">
          {tournament ? tournament.name : 'Game'}
          {game.round_no ? ` · round ${game.round_no}, board ${game.board}` : ''}
        </p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-ink sm:text-[26px]">
          {white?.name ?? 'White'} <span className="text-muted">vs</span> {black?.name ?? 'Black'}
        </h1>
      </header>

      {tournament?.suspended === 1 ? (
        <p className="mb-5 border-2 border-loss-fg bg-loss-bg px-3 py-2 text-[12px] font-bold text-loss-fg">
          This tournament is suspended by the owner. Moves and results are frozen until it is restored.
        </p>
      ) : null}

      {game.status === 'finished' ? <FinishedGameNotice id={game.id} /> : null}

      <GameBoard initial={initial} canSettle={false} />
    </div>
  );
}
