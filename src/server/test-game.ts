import { EventType, MatchStatus, PredictionType } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import type { Server } from "socket.io";
import { hashPassword } from "./auth.js";
import { ingestNormalizedEvent } from "./game-engine.js";
import { presentEvent } from "./event-presenter.js";
import { prisma } from "./prisma.js";
import { ensureRounds, ROUND_LENGTH_MINUTES } from "./txline.js";

type TestGameStatus = {
  enabled: boolean;
  matchId: string | null;
  startedAt: string | null;
  minute: number;
};

type DemoCompetitionStatus = TestGameStatus & {
  users: Array<{ username: string; password: string }>;
};

type SimulatedEvent = {
  id: string;
  matchId: string;
  eventType: EventType;
  minute: number;
  participant: number | null;
  rawAction: string;
  createdAt: string;
  simulated: true;
  title: string;
  subtitle: string;
  teamName: string;
};

const simulatedEventTypes = [
  EventType.CORNER,
  EventType.YELLOW_CARD,
  EventType.SUBSTITUTION,
  EventType.GOAL,
  EventType.RED_CARD,
];

export const demoFixtureId = 9900333;
const demoPassword = "demo123";
const demoUsers = ["alex", "mike", "john", "sara"];
const demoReplayIntervalMs = 3_000;
const demoTimeline: Array<{
  minute: number;
  eventType: EventType;
  participant: 1 | 2;
  scorerName?: string;
}> = [
  { minute: 3, eventType: EventType.GOAL, participant: 2, scorerName: "Skhiri (own goal)" },
  { minute: 7, eventType: EventType.GOAL, participant: 2, scorerName: "Brobbey" },
  { minute: 12, eventType: EventType.CORNER, participant: 1 },
  { minute: 19, eventType: EventType.CORNER, participant: 2 },
  { minute: 28, eventType: EventType.CORNER, participant: 2 },
  { minute: 30, eventType: EventType.CORNER, participant: 2 },
  { minute: 53, eventType: EventType.CORNER, participant: 1 },
  { minute: 54, eventType: EventType.GOAL, participant: 1, scorerName: "Mastouri" },
  { minute: 56, eventType: EventType.CORNER, participant: 2 },
  { minute: 61, eventType: EventType.CORNER, participant: 2 },
  { minute: 62, eventType: EventType.GOAL, participant: 2, scorerName: "van Hecke" },
  { minute: 67, eventType: EventType.SUBSTITUTION, participant: 1 },
  { minute: 71, eventType: EventType.SUBSTITUTION, participant: 2 },
  { minute: 75, eventType: EventType.SUBSTITUTION, participant: 1 },
  { minute: 76, eventType: EventType.CORNER, participant: 1 },
  { minute: 77, eventType: EventType.SUBSTITUTION, participant: 2 },
  { minute: 84, eventType: EventType.SUBSTITUTION, participant: 2 },
  { minute: 85, eventType: EventType.CORNER, participant: 2 },
  { minute: 90, eventType: EventType.SUBSTITUTION, participant: 1 },
  { minute: 93, eventType: EventType.CORNER, participant: 1 },
];

export type TestGameController = {
  start: (matchId: string) => TestGameStatus;
  stop: () => TestGameStatus;
  status: () => TestGameStatus;
  startDemoCompetition: () => Promise<DemoCompetitionStatus>;
  stopDemoCompetition: () => Promise<DemoCompetitionStatus>;
  demoCompetitionStatus: () => DemoCompetitionStatus;
};

export function createTestGameController(io: Server, logger: FastifyBaseLogger): TestGameController {
  let activeMatchId: string | null = null;
  let startedAt: Date | null = null;
  let minute = 0;
  let timer: NodeJS.Timeout | null = null;
  let sequence = 0;
  let demoMatchId: string | null = null;
  let demoStartedAt: Date | null = null;
  let demoMinute = 0;
  let demoTimelineIndex = 0;
  let demoTimer: NodeJS.Timeout | null = null;
  let demoSequence = 10_000;

  const emitStatus = () => {
    io.emit("test_game_status", getStatus());
  };

  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const stopDemoTimer = () => {
    if (demoTimer) clearInterval(demoTimer);
    demoTimer = null;
  };

  const getStatus = (): TestGameStatus => ({
    enabled: Boolean(activeMatchId),
    matchId: activeMatchId,
    startedAt: startedAt?.toISOString() ?? null,
    minute,
  });

  const tick = () => {
    if (!activeMatchId) return;

    minute += 1;
    sequence += 1;

    if (minute % ROUND_LENGTH_MINUTES === 1) {
      io.emit("round_started", {
        matchId: activeMatchId,
        minute,
        simulated: true,
        at: new Date().toISOString(),
      });
    }

    if (minute % ROUND_LENGTH_MINUTES === 0) {
      io.emit("round_finished", {
        matchId: activeMatchId,
        minute,
        simulated: true,
        at: new Date().toISOString(),
      });
    }

    if (Math.random() > 0.62) return;

    const eventType = simulatedEventTypes[Math.floor(Math.random() * simulatedEventTypes.length)] ?? EventType.CORNER;
    const participant = Math.random() > 0.5 ? 1 : 2;
    const teamName = participant === 1 ? "Participant 1" : "Participant 2";
    const event: SimulatedEvent = {
      id: `sim-${Date.now()}-${sequence}`,
      matchId: activeMatchId,
      eventType,
      minute,
      participant,
      rawAction: `SIMULATED_${eventType}`,
      createdAt: new Date().toISOString(),
      simulated: true,
      title: titleForEvent(eventType),
      subtitle: subtitleForEvent(eventType, teamName),
      teamName,
    };

    io.emit("event_created", event);
  };

  const getDemoStatus = (): DemoCompetitionStatus => ({
    enabled: Boolean(demoMatchId),
    matchId: demoMatchId,
    startedAt: demoStartedAt?.toISOString() ?? null,
    minute: demoMinute,
    users: demoUsers.map((username) => ({ username, password: demoPassword })),
  });

  const tickDemo = async () => {
    if (!demoMatchId) return;

    const script = demoTimeline[demoTimelineIndex];
    if (!script) {
      const finishedMatch = await prisma.match.update({
        where: { id: demoMatchId },
        data: { status: MatchStatus.FINISHED },
      });
      stopDemoTimer();
      const finishedMatchId = demoMatchId;
      io.emit("round_finished", {
        matchId: finishedMatchId,
        minute: demoMinute,
        simulated: true,
        at: new Date().toISOString(),
      });
      demoMatchId = null;
      demoStartedAt = null;
      demoMinute = 0;
      demoTimelineIndex = 0;
      io.emit("leaderboard_updated", { matchId: finishedMatch.id, at: new Date().toISOString(), finished: true });
      io.emit("test_game_status", getDemoStatus());
      logger.info({ matchId: finishedMatch.id }, "Demo competition finished");
      return;
    }

    demoMinute = script.minute;
    demoTimelineIndex += 1;
    demoSequence += 1;

    const match = await prisma.match.update({
      where: { id: demoMatchId },
      data: {
        status: MatchStatus.LIVE,
        startTime: new Date(Date.now() - demoMinute * 60_000),
      },
    });
    await ensureRounds(match.id);

    const roundNumber = Math.floor(script.minute / ROUND_LENGTH_MINUTES) + 1;
    const round = await prisma.round.findUnique({
      where: { matchId_number: { matchId: match.id, number: roundNumber } },
    });
    if (!round) return;

    const users = await prisma.user.findMany({
      where: { username: { in: demoUsers } },
      select: { id: true, username: true },
    });

    await prisma.$transaction(
      users.map((user) =>
        prisma.prediction.upsert({
          where: { userId_matchId_roundId: { userId: user.id, matchId: match.id, roundId: round.id } },
          create: {
            userId: user.id,
            matchId: match.id,
            roundId: round.id,
            predictionType: demoPredictionFor(user.username, script.eventType, demoTimelineIndex),
            effectiveAt: new Date(Date.now() - 1_000),
          },
          update: {
            predictionType: demoPredictionFor(user.username, script.eventType, demoTimelineIndex),
            effectiveAt: new Date(Date.now() - 1_000),
          },
        }),
      ),
    );

    const { event, wonPredictions } = await ingestNormalizedEvent({
      eventType: script.eventType,
      fixtureId: demoFixtureId,
      txlineId: demoSequence,
      sequence: demoSequence,
      timestamp: Date.now(),
      matchMinute: script.minute,
      participant: script.participant,
      rawAction: `DEMO_${script.eventType}`,
      raw: {
        FixtureId: demoFixtureId,
        Id: demoSequence,
        Seq: demoSequence,
        Ts: Date.now(),
        Action: `DEMO_${script.eventType}`,
        Participant: script.participant,
        Data: {
          PlayerName: script.scorerName ?? null,
        },
        dataSoccer: {
          Action: `DEMO_${script.eventType}`,
          Participant: script.participant,
          New: { Minutes: script.minute },
        },
      },
    });

    if (!event) return;

    if (script.eventType === EventType.GOAL) {
      const nextScore = script.participant === 1
        ? { homeScore: match.homeScore + 1, awayScore: match.awayScore }
        : { homeScore: match.homeScore, awayScore: match.awayScore + 1 };
      await prisma.match.update({ where: { id: match.id }, data: nextScore });
      io.emit("match_score_updated", { matchId: match.id, ...nextScore });
    }

    const presentedEvent = presentEvent(event, {
      participant1: match.participant1,
      participant2: match.participant2,
    });
    io.emit("event_created", presentedEvent);

    for (const prediction of wonPredictions) {
      io.emit("prediction_won", { ...prediction, event: presentedEvent });
      io.emit("streak_updated", {
        userId: prediction.userId,
        matchId: prediction.matchId,
        roomId: prediction.roomId,
        streak: prediction.streak,
        score: prediction.score,
      });
      if (prediction.roomId) {
        io.emit("leaderboard_updated", { matchId: prediction.matchId, roomId: prediction.roomId, at: new Date().toISOString() });
      }
    }

    if (wonPredictions.some((prediction) => !prediction.roomId)) {
      io.emit("leaderboard_updated", { matchId: match.id, at: new Date().toISOString() });
    }
  };

  return {
    start(matchId: string) {
      stopTimer();
      activeMatchId = matchId;
      startedAt = new Date();
      minute = 0;
      sequence = 0;
      timer = setInterval(tick, 3_000);
      emitStatus();
      logger.info({ matchId }, "Test game simulation enabled");
      return getStatus();
    },
    stop() {
      stopTimer();
      activeMatchId = null;
      startedAt = null;
      minute = 0;
      emitStatus();
      logger.info("Test game simulation disabled");
      return getStatus();
    },
    status: getStatus,
    async startDemoCompetition() {
      stopDemoTimer();

      const passwordHash = await hashPassword(demoPassword);
      await Promise.all(
        demoUsers.map((username) =>
          prisma.user.upsert({
            where: { username },
            create: { username, passwordHash },
            update: { passwordHash },
          }),
        ),
      );

      const match = await prisma.match.upsert({
        where: { txlineFixtureId: BigInt(demoFixtureId) },
        create: {
          txlineFixtureId: BigInt(demoFixtureId),
          competitionId: 72,
          competition: "World Cup Replay",
          fixtureGroupId: 9900,
          homeTeam: "Tunisia",
          awayTeam: "Netherlands",
          homeScore: 0,
          awayScore: 0,
          participant1: "Tunisia",
          participant2: "Netherlands",
          participant1IsHome: true,
          startTime: new Date(),
          status: MatchStatus.LIVE,
        },
        update: {
          competition: "World Cup Replay",
          homeTeam: "Tunisia",
          awayTeam: "Netherlands",
          participant1: "Tunisia",
          participant2: "Netherlands",
          participant1IsHome: true,
          homeScore: 0,
          awayScore: 0,
          startTime: new Date(),
          status: MatchStatus.LIVE,
        },
      });

      await prisma.$transaction([
        prisma.prediction.deleteMany({ where: { matchId: match.id } }),
        prisma.event.deleteMany({ where: { matchId: match.id } }),
        prisma.userMatchState.deleteMany({ where: { matchId: match.id } }),
      ]);
      await ensureRounds(match.id);

      demoMatchId = match.id;
      demoStartedAt = new Date();
      demoMinute = 0;
      demoTimelineIndex = 0;
      demoSequence = 10_000;
      demoTimer = setInterval(() => {
        tickDemo().catch((error) => logger.error({ error }, "Demo competition tick failed"));
      }, demoReplayIntervalMs);

      io.emit("test_game_status", getDemoStatus());
      io.emit("leaderboard_updated", { matchId: match.id, at: new Date().toISOString() });
      logger.info({ matchId: match.id }, "Demo competition enabled");
      return getDemoStatus();
    },
    async stopDemoCompetition() {
      stopDemoTimer();
      if (demoMatchId) {
        await prisma.match.update({
          where: { id: demoMatchId },
          data: { status: MatchStatus.FINISHED },
        });
        io.emit("leaderboard_updated", { matchId: demoMatchId, at: new Date().toISOString(), finished: true });
      }
      demoMatchId = null;
      demoStartedAt = null;
      demoMinute = 0;
      demoTimelineIndex = 0;
      io.emit("test_game_status", getDemoStatus());
      logger.info("Demo competition disabled");
      return getDemoStatus();
    },
    demoCompetitionStatus: getDemoStatus,
  };
}

function titleForEvent(eventType: EventType): string {
  if (eventType === EventType.YELLOW_CARD) return "Yellow Card";
  if (eventType === EventType.RED_CARD) return "Red Card";
  return eventType
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function demoPredictionFor(username: string, eventType: EventType, index: number): PredictionType {
  if (username === "alex") return eventTypeToPredictionType(eventType);
  if (username === "john" && index % 2 === 0) return eventTypeToPredictionType(eventType);
  if (username === "sara" && (eventType === EventType.GOAL || eventType === EventType.CORNER)) {
    return eventTypeToPredictionType(eventType);
  }
  if (username === "mike" && index % 3 === 0) return eventTypeToPredictionType(eventType);

  const misses = [
    PredictionType.NOTHING_HAPPENS,
    PredictionType.YELLOW_CARD,
    PredictionType.RED_CARD,
    PredictionType.SUBSTITUTION,
    PredictionType.CORNER,
    PredictionType.GOAL,
  ];

  return misses[index % misses.length] ?? PredictionType.NOTHING_HAPPENS;
}

function eventTypeToPredictionType(eventType: EventType): PredictionType {
  return eventType as unknown as PredictionType;
}

function subtitleForEvent(eventType: EventType, teamName: string): string {
  if (eventType === EventType.GOAL) return `${teamName} scores`;
  if (eventType === EventType.CORNER) return `${teamName} earned a corner`;
  if (eventType === EventType.YELLOW_CARD) return `${teamName} receives a yellow card`;
  if (eventType === EventType.RED_CARD) return `${teamName} receives a red card`;
  if (eventType === EventType.SUBSTITUTION) return `${teamName} makes a substitution`;
  return teamName;
}
