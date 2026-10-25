/**
 * Rating history, derived from the record.
 *
 * There is no Elo column anywhere: a rating that the app announces without
 * earning it would be invention. Everything here is computed by walking a
 * player's finished games in the order they ended, applying the classic Elo
 * update after each one. The result is deterministic — the same games always
 * produce the same curve — and it is honest about what it is: a derivation of
 * the results that actually happened, not a claim made by any authority.
 *
 * Games where either seat has no account behind it change nothing: no
 * estimate can be attached to a seat nobody played.
 */

export type RatedGame = {
  whiteUserId: number | null;
  blackUserId: number | null;
  /** '1-0' | '0-1' | '1/2-1/2' */
  result: string | null;
  /** Order of ending — the games arrive already sorted by it. */
  at: number;
};

export type RatingPoint = {
  userId: number;
  at: number;
  rating: number;
};

/** The start of every curve. Matches the default on `users`. */
export const BASE_RATING = 1200;

/** K for an established player. Everyone here starts provisional at 40. */
const K_ESTABLISHED = 20;
const K_PROVISIONAL = 40;
/** Games after which a player is no longer provisional on a fresh curve. */
const PROVISIONAL_GAMES = 10;

const expectedWhiteScore = (whiteRating: number, blackRating: number): number => {
  const difference = Math.max(-400, Math.min(400, blackRating - whiteRating));
  return 1 / (1 + Math.pow(10, difference / 400));
};

/** The white score a result means: 1, 0 or a half. */
const whiteScoreOf = (result: string | null): number | null => {
  if (result === '1-0') return 1;
  if (result === '0-1') return 0;
  if (result === '1/2-1/2') return 0.5;
  return null;
};

/**
 * Builds each player's rating curve from a chronologically-ordered game list
 * (oldest first). The map's values hold the most recent rating last.
 */
export function ratingCurvesFromGames(games: RatedGame[]): Map<number, RatingPoint[]> {
  const curves = new Map<number, RatingPoint[]>();
  const ratings = new Map<number, number>();
  const played = new Map<number, number>();

  const bump = (userId: number, delta: number, at: number): void => {
    const next = Math.round((ratings.get(userId) ?? BASE_RATING) + delta);
    ratings.set(userId, next);
    const count = (played.get(userId) ?? 0) + 1;
    played.set(userId, count);

    const curve = curves.get(userId) ?? [];
    curve.push({ userId, at, rating: next });
    curves.set(userId, curve);
  };

  const factorFor = (userId: number): number =>
    (played.get(userId) ?? 0) < PROVISIONAL_GAMES ? K_PROVISIONAL : K_ESTABLISHED;

  for (const game of games) {
    if (game.whiteUserId == null || game.blackUserId == null) continue;
    const score = whiteScoreOf(game.result);
    if (score == null) continue;

    const whiteRating = ratings.get(game.whiteUserId) ?? BASE_RATING;
    const blackRating = ratings.get(game.blackUserId) ?? BASE_RATING;
    const expected = expectedWhiteScore(whiteRating, blackRating);

    bump(game.whiteUserId, factorFor(game.whiteUserId) * (score - expected), game.at);
    bump(game.blackUserId, factorFor(game.blackUserId) * (1 - score - (1 - expected)), game.at);
  }

  return curves;
}

/** The last point of a player's curve, or null when they have no rated finished games. */
export function currentRatingFrom(curves: Map<number, RatingPoint[]>, userId: number): RatingPoint | null {
  const curve = curves.get(userId);
  return curve && curve.length > 0 ? curve[curve.length - 1] : null;
}
