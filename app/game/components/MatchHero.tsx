import type { Match, Round } from "../types.js";
import { formatMultiplier, formatScore, formatStatus, statusClass } from "../utils.js";
import { MatchScore } from "./MatchScore.js";
import { Stat } from "./Stat.js";
import { TeamName } from "./TeamName.js";

export function MatchHero({ match, roomCode, score, streak, fullTime, halfTime, round }: {
  match: Match; roomCode?: string; score: number; streak: number; fullTime: boolean; halfTime: boolean; round: Round | null;
}) {
  return <div className="match-stage mb-4 overflow-hidden rounded-lg border border-white/10 bg-black/30">
    <div className="relative border-b border-white/10 bg-white/[0.06] p-4">
      <div className="pulse-ring" aria-hidden="true" />
      <div className="mb-2 flex items-center justify-between">
        <span className={`rounded px-2 py-1 text-xs font-semibold ${statusClass(match.status)}`}>{formatStatus(match.status)}</span>
        <span className="text-xs text-white/50">{roomCode ? `Room ${roomCode}` : `TxLINE #${match.txlineFixtureId}`}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamName name={match.homeTeam} align="right" /><MatchScore match={match} /><TeamName name={match.awayTeam} align="left" />
      </div>
    </div>
    <div className="grid grid-cols-3 divide-x divide-white/10">
      <Stat label="Score" value={formatScore(score)} />
      <Stat label="Streak" value={`x${formatMultiplier(streak)}`} active={streak >= 3} />
      <Stat label="Round" value={fullTime ? "FT" : halfTime ? "HT" : round ? `${round.startMinute}-${round.endMinute}` : "Pre"} />
    </div>
  </div>;
}
