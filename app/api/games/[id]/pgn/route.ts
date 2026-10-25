import { NextResponse } from 'next/server';

import { handleError, jsonError, parseId } from '@/lib/api';
import { buildPgn } from '@/lib/game';
import { getGameWithPlayers, getTournamentById, movesOf } from '@/lib/service';
import { getTimeControl } from '@/lib/time-controls';

type Params = { params: Promise<{ id: string }> };

const pgnDate = (ms: number): string => {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}`;
};

/**
 * Export.
 *
 * The headers are the honest minimum: the two names as the seats carry them, the
 * container the game belongs to, the result and how it was reached, and the time
 * control the clock enforced. Anything richer than that would be a claim the
 * record cannot back.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const gameId = parseId(id);
    if (!gameId) return jsonError('Bad game id.');

    const game = getGameWithPlayers(gameId);
    if (!game) return jsonError('Game not found.', 404);
    if (game.status !== 'finished' || !game.result) {
      return jsonError('Only finished games can be exported.');
    }

    const moves = movesOf(game);
    const control = getTimeControl(game.time_control);
    const tournament = game.tournament_id ? getTournamentById(game.tournament_id) : null;

    const pgn = buildPgn(
      {
        Event: tournament?.name ?? 'Arbiter game',
        Date: pgnDate(game.updated_at),
        White: game.white_name || 'White',
        Black: game.black_name || 'Black',
        Result: game.result,
        TimeControl: game.time_control,
        Termination: game.termination ?? '',
      },
      moves.map((move) => ({ san: move.san })),
      game.result,
    );

    if (!pgn) return jsonError('The move list of this game could not be exported.');

    const filename = `arbiter-game-${game.id}.pgn`;
    return new NextResponse(`${pgn}\n`, {
      headers: {
        'Content-Type': 'application/x-chess-pgn; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
