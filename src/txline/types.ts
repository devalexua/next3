export type TxLineScoreEventType =
  | "GOAL"
  | "YELLOW_CARD"
  | "RED_CARD"
  | "CORNER"
  | "SUBSTITUTION"
  | "UNKNOWN";

export type SoccerScore = {
  Goals: number;
  YellowCards: number;
  RedCards: number;
  Corners: number;
};

export type SoccerFixtureScore = {
  Participant1?: {
    H1?: SoccerScore;
    HT?: SoccerScore;
    H2?: SoccerScore;
    ET1?: SoccerScore;
    ET2?: SoccerScore;
    PE?: SoccerScore;
    ETTotal?: SoccerScore;
    Total?: SoccerScore;
  };
  Participant2?: {
    H1?: SoccerScore;
    HT?: SoccerScore;
    H2?: SoccerScore;
    ET1?: SoccerScore;
    ET2?: SoccerScore;
    PE?: SoccerScore;
    ETTotal?: SoccerScore;
    Total?: SoccerScore;
  };
};

export type SoccerFixtureClock = {
  running: boolean;
  Running?: boolean;
  seconds: number;
  Seconds?: number;
};

export type SoccerUpdateReference = {
  Clock?: SoccerFixtureClock;
  FreeKickType?: unknown;
  GoalType?: unknown;
  Minutes?: number;
  Outcome?: string;
  PlayerId?: number;
  PlayerInId?: number;
  PlayerOutId?: number;
  ThrowInType?: unknown;
  Type?: string;
};

export type SoccerData = {
  Action?: string;
  Active?: boolean;
  Clock?: SoccerFixtureClock;
  Id?: number;
  IsTeam?: boolean;
  New?: SoccerUpdateReference;
  Origin?: string;
  Outcome?: string;
  Participant?: number;
  Participants?: number[];
  PlayerId?: number;
  PlayerInId?: number;
  PlayerOutId?: number;
  Previous?: SoccerUpdateReference;
  Type?: string;
};

export type TxLineScoresRecord = {
  fixtureId?: number;
  FixtureId?: number;
  gameState?: string;
  GameState?: string;
  startTime?: number;
  StartTime?: number;
  isTeam?: boolean;
  IsTeam?: boolean;
  fixtureGroupId?: number;
  FixtureGroupId?: number;
  competitionId?: number;
  CompetitionId?: number;
  countryId?: number;
  CountryId?: number;
  sportId?: number;
  SportId?: number;
  participant1IsHome?: boolean;
  Participant1IsHome?: boolean;
  participant2Id?: number;
  Participant2Id?: number;
  participant1Id?: number;
  Participant1Id?: number;
  coverageSecondaryData?: boolean;
  CoverageSecondaryData?: boolean;
  coverageType?: string;
  CoverageType?: string;
  action?: string;
  Action?: string;
  id?: number;
  Id?: number;
  ts?: number;
  Ts?: number;
  connectionId?: number;
  ConnectionId?: number;
  seq?: number;
  Seq?: number;
  statusSoccerId?: unknown;
  StatusId?: unknown;
  type?: unknown;
  Type?: unknown;
  confirmed?: boolean;
  Confirmed?: boolean;
  Clock?: { running?: boolean; Running?: boolean; seconds?: number; Seconds?: number };
  Score?: unknown;
  Data?: Record<string, unknown>;
  Stats?: Record<string, unknown>;
  scoreSoccer?: SoccerFixtureScore;
  dataSoccer?: SoccerData;
  stats?: Record<string, unknown>;
  participant?: number;
  Participant?: number;
  possession?: number;
  Possession?: number;
  possessionType?: unknown;
  PossessionType?: unknown;
  possibleEventSoccer?: unknown;
  PossibleEvent?: unknown;
};

export type SseMessage = {
  id?: string;
  event?: string;
  data?: string;
};

export type NormalizedTxLineScoreEvent = {
  eventType: TxLineScoreEventType;
  fixtureId: number;
  txlineId: number;
  sequence: number;
  timestamp: number;
  matchMinute: number | null;
  participant: number | null;
  rawAction: string;
  raw: TxLineScoresRecord;
};
