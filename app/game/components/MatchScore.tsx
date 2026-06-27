import { motion } from "framer-motion";
import type { Match } from "../types.js";

export function MatchScore({ match, compact = false }: { match: Match; compact?: boolean }) {
  if (match.status === "SCHEDULED") {
    return <div className="rounded bg-white/10 px-2 py-1 text-xs text-white/70">vs</div>;
  }

  return (
    <motion.div
      key={`${match.id}-${match.homeScore}-${match.awayScore}-${compact ? "compact" : "full"}`}
      className={
        compact
          ? "min-w-[54px] rounded bg-lime-300 px-2 py-1 text-center text-sm font-black text-black shadow shadow-lime-300/20"
          : "min-w-[78px] rounded-lg border border-lime-200/40 bg-lime-300 px-3 py-2 text-center text-2xl font-black text-black shadow-lg shadow-lime-300/20"
      }
      initial={{ scale: 1.08 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 18 }}
    >
      {match.homeScore} - {match.awayScore}
    </motion.div>
  );
}
