import { Chess } from 'chess.js';

import type { Side } from './chess-ui';

export type CapturedPieces = { whiteHas: string[]; blackHas: string[] };

const PIECE_VALUE: Record<string, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9 };

export function capturedPieces(startFen: string, fen: string): CapturedPieces {
  const counts = (source: string) => {
    const map = new Map<string, number>();
    try {
      for (const row of new Chess(source).board()) {
        for (const square of row) {
          if (!square) continue;
          const key = `${square.color}${square.type.toUpperCase()}`;
          map.set(key, (map.get(key) ?? 0) + 1);
        }
      }
    } catch {
      return map;
    }
    return map;
  };

  const start = counts(startFen);
  const now = counts(fen);
  const missing = (color: Side) =>
    ['P', 'N', 'B', 'R', 'Q'].flatMap((kind) => {
      const key = `${color}${kind}`;
      const gone = (start.get(key) ?? 0) - (now.get(key) ?? 0);
      return gone > 0 ? new Array(gone).fill(key) : [];
    });

  return { whiteHas: missing('b'), blackHas: missing('w') };
}

export function materialAdvantage(captured: CapturedPieces, side: Side): number {
  const points = (pieces: string[]) => pieces.reduce(
    (total, piece) => total + (PIECE_VALUE[piece[1]] ?? 0),
    0,
  );
  const white = points(captured.whiteHas);
  const black = points(captured.blackHas);
  const whiteLead = white - black;
  return side === 'w' ? whiteLead : -whiteLead;
}
