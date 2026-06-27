import { Trophy } from "lucide-react";
import type { LeaderboardRow, User } from "../types.js";
import { LeaderboardList } from "./LeaderboardList.js";

export function GlobalLeaderboard({
  rows,
  currentUserRank,
  user,
}: {
  rows: LeaderboardRow[];
  currentUserRank: LeaderboardRow | null;
  user: User | null;
}) {
  const currentUserVisible = rows.some((row) => row.username === user?.username);
  const pinnedUserRank = user && currentUserRank && !currentUserVisible ? currentUserRank : null;

  return (
    <section className="pb-6">
      <div className="mb-3 flex items-center gap-2">
        <Trophy className="text-lime-200" size={18} />
        <h2 className="font-semibold text-white">Global Leaders</h2>
      </div>
      <LeaderboardList rows={rows} user={user} empty="Scores appear after live rounds resolve" />
      {pinnedUserRank ? (
        <div className="mt-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Your position</div>
          <LeaderboardList rows={[pinnedUserRank]} user={user} empty="" />
        </div>
      ) : null}
    </section>
  );
}
