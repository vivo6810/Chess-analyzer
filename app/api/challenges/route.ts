import { NextResponse } from 'next/server';

import { handleError, jsonError, readJson, requireUser } from '@/lib/api';
import { createChallenge, incomingChallenges, outgoingChallenges } from '@/lib/challenge';

/** The signed-in player's open challenges, incoming first. */
export async function GET() {
  try {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    return NextResponse.json({
      incoming: incomingChallenges(auth.user.id),
      outgoing: outgoingChallenges(auth.user.id),
    });
  } catch (error) {
    return handleError(error);
  }
}

type CreateBody = { opponent: string; timeControl: string };

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    const body = await readJson<CreateBody>(request);
    const opponent = typeof body.opponent === 'string' ? body.opponent : '';
    const timeControl = typeof body.timeControl === 'string' ? body.timeControl : '';
    if (!opponent) return jsonError('Name the player you want to challenge.');

    const challenge = createChallenge({
      challengerId: auth.user.id,
      opponentUsername: opponent,
      timeControlId: timeControl,
    });

    return NextResponse.json({ challenge }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
