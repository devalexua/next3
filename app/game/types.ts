export type User = { id: string; username: string };
export type MatchStatus = "SCHEDULED" | "OPEN" | "LIVE" | "HALF_TIME" | "FINISHED";
export type Match = {
  id: string; txlineFixtureId: string; competition: string; homeTeam: string; awayTeam: string;
  homeScore: number; awayScore: number; clockSeconds: number; clockRunning: boolean;
  clockUpdatedAt: string | null; startTime: string; opensAt: string; status: MatchStatus;
};
export type Round = { id: string; number: number; startMinute: number; endMinute: number; status: "UPCOMING" | "LOCKED" | "RESOLVED" };
export type PredictionType = "GOAL" | "YELLOW_CARD" | "RED_CARD" | "CORNER" | "SUBSTITUTION" | "NOTHING_HAPPENS";
export type EventRecord = {
  id: string; matchId: string; eventType: PredictionType | "UNKNOWN"; minute: number | null;
  participant: number | null; rawAction: string; createdAt: string; simulated?: boolean;
  title?: string; subtitle?: string; teamName?: string | null; playerName?: string | null;
  playerId?: number | null; playerInId?: number | null; playerOutId?: number | null;
};
export type Prediction = {
  id: string; roundId: string; predictionType: PredictionType; status: "PENDING" | "WON" | "LOST" | "CANCELED";
  pointsAwarded: number; effectiveAt: string; createdAt: string; round: Round;
};
export type MatchDetail = {
  match: Match; rounds: Round[]; activePredictionRound: Round | null; currentRound: Round | null;
  events: EventRecord[]; myPredictions: Prediction[]; myState: { score: number; streak: number } | null;
};
export type Room = {
  id: string; code: string; name: string; matchId: string; createdByUserId: string;
  createdAt: string; memberCount: number; match: Match;
};
export type RoomDetail = MatchDetail & { room: Room };
export type LeaderboardRow = { rank: number; username: string; score: number; streak?: number; bestStreak?: number };
export type TestGameStatus = { enabled: boolean; matchId: string | null; startedAt: string | null; minute: number };
export type MatchPanelTab = "feed" | "leaderboard" | "rounds";
export type HomeTab = "games" | "rooms" | "leaderboard";
export type MatchListView = "active" | "mine" | "past";
