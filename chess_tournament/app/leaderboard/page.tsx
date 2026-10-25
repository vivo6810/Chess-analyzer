import { redirect } from 'next/navigation';

/**
 * The old leaderboard route, kept alive as a redirect: the same table now
 * lives on `/players`, where the names are links and the ratings are derived.
 */
export default function LeaderboardPage() {
  redirect('/players');
}
