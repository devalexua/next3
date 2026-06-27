import type { LeaderboardRow, User } from "../types.js";
import { LeaderboardList } from "./LeaderboardList.js";

export function MatchLeaderboard({ rows, user, compact = false }: { rows: LeaderboardRow[]; user: User | null; compact?: boolean }) {
  return (
    <section className={compact ? "" : "mb-5"}>
      {!compact ? <h2 className="mb-3 font-semibold text-white">Match Leaderboard</h2> : null}
      <LeaderboardList rows={rows} user={user} empty="No points yet" />
    </section>
  );
}
