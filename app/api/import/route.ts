import { NextResponse } from 'next/server';

import { handleError, jsonError, readJson, requireUser } from '@/lib/api';
import { commitImport, parsePgn } from '@/lib/import-pgn';

/**
 * Import.
 *
 * Parsing and committing are separate steps on purpose: a file that fails to
 * play never touches the database, and a file that plays but arrives twice
 * leaves with a plain list of what landed and what was already on file.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if ('response' in auth) return auth.response;

    const body = await readJson<{ pgn: string }>(request);
    const pgn = typeof body.pgn === 'string' ? body.pgn : '';
    if (!pgn.trim()) return jsonError('Paste a PGN first.');

    const games = parsePgn(pgn);
    const outcome = commitImport(auth.user.id, auth.user.username, games);

    return NextResponse.json(outcome, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
