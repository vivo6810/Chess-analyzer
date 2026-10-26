export function averageGameRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  return Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length);
}

export function averageBlundersPerMatch(blunders: number, games: number): number | null {
  if (games <= 0) return null;
  return Number((blunders / games).toFixed(1));
}

export function averageAccuracy(totalAccuracy: number, games: number): number | null {
  if (games <= 0) return null;
  return Number((totalAccuracy / games).toFixed(1));
}
