import { AnimatePresence, motion } from "framer-motion";
import type { LeaderboardRow, User } from "../types.js";
import { formatScore } from "../utils.js";

export function LeaderboardList({ rows, user, empty }: { rows: LeaderboardRow[]; user: User | null; empty: string }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-black/25 p-3">
      {rows.length === 0 ? <div className="py-6 text-center text-sm text-white/45">{empty}</div> : null}
      <AnimatePresence initial={false}>
        {rows.map((row) => (
          <motion.div
            layout
            key={row.username}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`flex items-center gap-3 rounded-md px-3 py-2 ${row.username === user?.username ? "bg-lime-300 text-black" : "bg-white/[0.06] text-white"}`}
          >
            <div className="grid h-8 w-8 place-items-center rounded-full bg-black/20 text-sm font-bold">{row.rank}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{row.username}</div>
              <div className={row.username === user?.username ? "text-xs text-black/60" : "text-xs text-white/45"}>
                Streak {row.streak ?? row.bestStreak ?? 0}
              </div>
            </div>
            <div className="text-lg font-semibold">{formatScore(row.score)}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
