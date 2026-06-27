import { motion } from "framer-motion";
import { Clock, Plus, Users } from "lucide-react";
import { useMemo } from "react";
import type { Match, MatchListView, User } from "../types.js";
import { formatDuration, formatStatus, statusClass } from "../utils.js";
import { MatchScore } from "./MatchScore.js";
import { TeamName } from "./TeamName.js";

export function MatchList({
  matches,
  view,
  now,
  user,
  onSelect,
  onCreateRoom,
}: {
  matches: Match[];
  view: MatchListView;
  now: number;
  user: User | null;
  onSelect: (id: string) => void;
  onCreateRoom: (id: string) => void;
}) {
  const nextMatches = useMemo(() => matches.slice(0, view === "active" ? 12 : 20), [matches, view]);
  const heading = view === "active" ? "Pick a Match" : view === "mine" ? "My Games" : "Recent Results";
  const empty = view === "mine"
    ? "Your games appear here after you join a room or make a prediction."
    : view === "past"
      ? "No completed matches yet."
      : "No live or upcoming matches available.";

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{heading}</h2>
        <span className="rounded bg-white/10 px-2 py-1 text-xs text-white/70">{matches.length} synced</span>
      </div>
      {nextMatches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-5 py-10 text-center text-sm leading-6 text-white/45">
          {empty}
        </div>
      ) : null}
      <div className="space-y-3">
        {nextMatches.map((match, index) => (
          <motion.div
            key={match.id}
            className="match-card group relative w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.07] p-4 text-left shadow-lg shadow-black/10"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: index * 0.035, duration: 0.28 }}
          >
            <div className="match-card-stripe" aria-hidden="true" />
            <button onClick={() => onSelect(match.id)} className="relative block w-full text-left">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className={`rounded px-2 py-1 text-xs font-semibold ${statusClass(match.status)}`}>{formatStatus(match.status)}</span>
                <span className="text-xs text-white/50">#{match.txlineFixtureId}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <TeamName name={match.homeTeam} align="right" />
                <MatchScore match={match} compact />
                <TeamName name={match.awayTeam} align="left" />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2 text-white/65">
                  <Clock size={16} />
                  <span className="truncate">{new Date(match.startTime).toLocaleString()}</span>
                </div>
                <span className={match.status === "FINISHED" ? "text-white/55" : now >= new Date(match.opensAt).getTime() ? "text-lime-200" : "text-white/70"}>
                  {match.status === "FINISHED"
                    ? "Full time"
                    : now >= new Date(match.opensAt).getTime()
                      ? "Open"
                      : formatDuration(new Date(match.startTime).getTime() - now)}
                </span>
              </div>
            </button>
            {user && match.status !== "FINISHED" ? (
              <div className="relative mt-3 border-t border-white/10 pt-3">
                <button
                  onClick={() => onCreateRoom(match.id)}
                  className="flex w-full items-center justify-between rounded-md bg-black/20 px-3 py-2 text-left transition hover:bg-white/8"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-white/65">
                    <Users size={14} className="text-sky-200" />
                    Friends only
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-sky-300/15 px-2 py-1 text-xs font-black text-sky-100">
                    <Plus size={12} />
                    Create
                  </span>
                </button>
              </div>
            ) : null}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
