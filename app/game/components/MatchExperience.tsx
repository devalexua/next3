import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { matchDurationMinutes } from "../config.js";
import type { EventRecord, LeaderboardRow, Match, MatchDetail, MatchPanelTab, PredictionType, Room, TestGameStatus, User } from "../types.js";
import { dedupeTimelineEvents, getEffectiveClockSeconds, getMsUntilRoundEnd, getRoundAtTime, isHalfTime } from "../utils.js";
import { AdminTestControls } from "./AdminTestControls.js";
import { MatchCenter } from "./MatchCenter.js";
import { MatchHero } from "./MatchHero.js";
import { PredictionPanel } from "./PredictionPanel.js";
import { RoomHeader } from "./RoomHeader.js";
import { RoundStatus } from "./RoundStatus.js";

export type MatchExperienceProps = {
  detail: MatchDetail | null;
  fallbackMatch: Match;
  room?: Room | null;
  leaderboard: LeaderboardRow[];
  user: User | null;
  now: number;
  adminToken: string;
  setAdminToken: (value: string) => void;
  showAdminTest: boolean;
  testGameStatus: TestGameStatus;
  simulatedEvents: EventRecord[];
  onBack: () => void;
  onRefreshTestGameStatus: () => void;
  onSubmit: (predictionType: PredictionType) => Promise<void>;
  onCancelPrediction: (predictionId: string) => Promise<void>;
};

export function MatchExperience(props: MatchExperienceProps) {
  const [activeTab, setActiveTab] = useState<MatchPanelTab>("feed");
  const match = props.detail?.match ?? props.fallbackMatch;
  const predictions = props.detail?.myPredictions ?? [];
  const predictionRound = getRoundAtTime(match, props.detail?.rounds ?? [], props.now);
  const state = props.detail?.myState ?? { score: 0, streak: 0 };
  const selected = predictions.find((item) => item.roundId === predictionRound?.id && item.status !== "CANCELED");
  const fullTime = match.status === "FINISHED" || getEffectiveClockSeconds(match, props.now) >= matchDurationMinutes * 60;
  const halfTime = isHalfTime(match, props.now);
  const timeToLock = predictionRound ? getMsUntilRoundEnd(match, predictionRound, props.now) : null;
  const finalSeconds = timeToLock !== null && timeToLock > 0 && timeToLock <= 10_000;
  const closed = !predictionRound || finalSeconds || (timeToLock !== null && timeToLock <= 0);
  const activationMs = selected ? new Date(selected.effectiveAt).getTime() - props.now : 0;
  const canCancel = selected?.status === "PENDING" && activationMs > 0;
  const locked = selected?.status === "PENDING" && activationMs <= 0;
  const events = dedupeTimelineEvents([...props.simulatedEvents, ...(props.detail?.events ?? [])]).slice(0, 30);

  useEffect(() => { if (fullTime) setActiveTab("leaderboard"); }, [fullTime]);

  return <section className="pb-6">
    <button onClick={props.onBack} className="mb-4 flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/8 px-3 text-sm font-medium text-white"><ArrowLeft size={17} />Matches</button>
    {props.room ? <RoomHeader room={props.room} /> : null}
    <MatchHero match={match} roomCode={props.room?.code} score={state.score} streak={state.streak} fullTime={fullTime} halfTime={halfTime} round={predictionRound} />
    <RoundStatus fullTime={fullTime} halfTime={halfTime} finalSeconds={finalSeconds} round={predictionRound} timeToLock={timeToLock} closed={closed} prediction={selected} canCancel={canCancel} locked={locked} />
    {!fullTime ? <PredictionPanel halfTime={halfTime} prediction={selected} disabled={closed || Boolean(selected)} canCancel={canCancel} seconds={Math.max(0, Math.ceil(activationMs / 1000))} progress={canCancel ? Math.min(100, Math.max(0, ((10_000 - activationMs) / 10_000) * 100)) : 100} onSubmit={props.onSubmit} onCancel={props.onCancelPrediction} /> : null}
    <MatchCenter activeTab={activeTab} setActiveTab={setActiveTab} fullTime={fullTime} events={events} predictions={predictions} leaderboard={props.leaderboard} user={props.user} />
    {props.showAdminTest ? <AdminTestControls matchId={match.id} adminToken={props.adminToken} setAdminToken={props.setAdminToken} status={props.testGameStatus} onRefresh={props.onRefreshTestGameStatus} /> : null}
  </section>;
}
