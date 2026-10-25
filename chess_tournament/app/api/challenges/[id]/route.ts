import { NextResponse } from 'next/server';

import { handleError, jsonError, parseId, readJson, requireUser } from '@/lib/api';
import { acceptChallenge, declineChallenge } from '@/lib/challenge';

type Params = { params: Promise<{ id: string }> };

/**
 * Accept or decline.
 *
 * Accepting creates the game before the response leaves, so the answer carries
 * the board's id and the challengers land on it directly.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    const { id } = await params;
    const challengeId = parseId(id);
    if (!challengeId) return jsonError('Bad challenge id.');

    const body = await readJson<{ action: string }>(request);
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'accept') {
      const result = acceptChallenge(challengeId, auth.user.id);
      return NextResponse.json({ challenge: result.challenge, gameId: result.gameId });
    }

    if (action === 'decline') {
      declineChallenge(challengeId, auth.user.id);
      return NextResponse.json({ challenge: { id: challengeId, status: 'declined' } });
    }

    return jsonError('The answer is accept or decline.');
  } catch (error) {
    return handleError(error);
  }
}
