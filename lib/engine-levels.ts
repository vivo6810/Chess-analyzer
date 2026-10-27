import { Chess } from 'chess.js';

export type EngineLevel = {
  id: number;
  label: string;
  depth: number;
  chaos: number;
  /** Stockfish's own UCI `Skill Level` (0–20): how freely the search mixes
      in worse moves, so the top half of the ladder separates by judgement,
      not only by depth. */
  skill: number;
  eloLabel?: string;
};

/* Three knobs, weakest to strongest: a shallow search (depth), occasional
   outright random legal moves (chaos), and Stockfish's deliberate move
   dilution (skill). Depth alone cannot make the engine feel weak — even a
   shallow search sees immediate mates — and chaos alone plays too obviously
   random once the moves get tactical. */
export const ENGINE_LEVELS: EngineLevel[] = [
  { id: 1, label: 'Level 1', depth: 1, chaos: 0.3, skill: 0 },
  { id: 2, label: 'Level 2', depth: 2, chaos: 0.2, skill: 1 },
  { id: 3, label: 'Level 3', depth: 3, chaos: 0.1, skill: 3 },
  { id: 4, label: 'Level 4', depth: 5, chaos: 0.05, skill: 6 },
  { id: 5, label: 'Level 5', depth: 8, chaos: 0, skill: 9 },
  { id: 6, label: 'Level 6', depth: 12, chaos: 0, skill: 11 },
  { id: 7, label: 'Level 7', depth: 14, chaos: 0, skill: 14 },
  { id: 8, label: 'Level 8', depth: 18, chaos: 0, skill: 20 },
];

export const DEFAULT_LEVEL_ID = 3;

export function getLevel(id: number): EngineLevel {
  const level = ENGINE_LEVELS.find((entry) => entry.id === id);
  if (!level) throw new RangeError(`Unknown engine level: ${id}`);
  return level;
}

export function selectEngineMove(
  fen: string,
  level: EngineLevel,
  bestUci: string | null,
  random = Math.random(),
): { uci: string; random: boolean } {
  const game = new Chess(fen);
  const legalMoves = game.moves({ verbose: true });
  if (legalMoves.length === 0) throw new Error('No legal engine move is available.');

  const bestIsLegal = legalMoves.some((move) => `${move.from}${move.to}${move.promotion ?? ''}` === bestUci);
  if (random < level.chaos || !bestUci || !bestIsLegal) {
    const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    return { uci: `${move.from}${move.to}${move.promotion ?? ''}`, random: true };
  }
  return { uci: bestUci, random: false };
}
