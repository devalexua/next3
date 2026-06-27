import { AnimatePresence, motion } from "framer-motion";
import type { EventRecord, LeaderboardRow, MatchPanelTab, Prediction, User } from "../types.js";
import { formatScore } from "../utils.js";
import { MatchLeaderboard } from "./MatchLeaderboard.js";
import { RecentPredictions } from "./RecentPredictions.js";
import { Timeline } from "./Timeline.js";

export function MatchCenter({ activeTab, setActiveTab, fullTime, events, predictions, leaderboard, user }: {
  activeTab: MatchPanelTab; setActiveTab: (tab: MatchPanelTab) => void; fullTime: boolean; events: EventRecord[];
  predictions: Prediction[]; leaderboard: LeaderboardRow[]; user: User | null;
}) {
  const counts = { feed: events.length, leaderboard: leaderboard.length, rounds: predictions.length };
  const leader = leaderboard[0];
  return <section className="mb-5 rounded-lg border border-white/10 bg-black/25 p-3">
    <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-white">Match Center</h2><div className="text-xs text-white/45">{leader ? `#1 ${leader.username} · ${formatScore(leader.score)} pts` : "Live feed and rankings"}</div></div>{user ? <div className="rounded bg-white/8 px-2 py-1 text-xs font-semibold text-white/70">{user.username}</div> : null}</div>
    {!fullTime ? <div className="mb-3 grid grid-cols-3 gap-1 rounded-md bg-white/8 p-1">{([['feed', 'Feed'], ['leaderboard', 'Leaders'], ['rounds', 'Rounds']] as Array<[MatchPanelTab, string]>).map(([value, label]) => <button key={value} onClick={() => setActiveTab(value)} className={`h-10 rounded px-2 text-xs font-black ${activeTab === value ? "bg-lime-300 text-black" : "text-white/60 hover:bg-white/8 hover:text-white"}`}>{label}<span className={activeTab === value ? "ml-1 text-black/55" : "ml-1 text-white/35"}>{counts[value]}</span></button>)}</div> : null}
    <AnimatePresence mode="wait" initial={false}>
      {activeTab === "feed" ? <motion.div key="feed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><Timeline events={events} compact /></motion.div> : null}
      {fullTime || activeTab === "leaderboard" ? <motion.div key="leaderboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><MatchLeaderboard rows={leaderboard} user={user} compact /></motion.div> : null}
      {activeTab === "rounds" ? <motion.div key="rounds" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><RecentPredictions predictions={predictions} compact /></motion.div> : null}
    </AnimatePresence>
  </section>;
}
