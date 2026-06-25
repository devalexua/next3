import {
  EventType,
  MatchStatus,
  PredictionStatus,
  PredictionType,
  RoundStatus,
  type Prisma,
  type Event,
  type Match,
} from "@prisma/client";
import { prisma } from "./prisma.js";
import { ensureRounds, ROUND_LENGTH_MINUTES } from "./txline.js";
import type { NormalizedTxLineScoreEvent } from "../txline/types.js";

const basePoints: Record<PredictionType, number> = {
  CORNER: 2,
  SUBSTITUTION: 2,
  YELLOW_CARD: 5,
  NOTHING_HAPPENS: 1,
  GOAL: 7,
  RED_CARD: 20,
};

const scoringEventTypes = new Set<EventType>([
  EventType.GOAL,
  EventType.YELLOW_CARD,
  EventType.RED_CARD,
  EventType.CORNER,
  EventType.SUBSTITUTION,
]);

export async function ingestNormalizedEvent(normalized: NormalizedTxLineScoreEvent): Promise<{
  event: Event | null;
  wonPredictions: ResolvedPrediction[];
}> {
  const match = await prisma.match.findUnique({
    where: { txlineFixtureId: BigInt(normalized.fixtureId) },
  });

  if (!match || normalized.eventType === "UNKNOWN") {
    return { event: null, wonPredictions: [] };
  }

  await ensureRounds(match.id);

  const event = await prisma.event.upsert({
    where: { matchId_txlineSeq: { matchId: match.id, txlineSeq: normalized.sequence } },
    create: {
      matchId: match.id,
      txlineSeq: normalized.sequence,
      txlineId: normalized.txlineId,
      eventType: normalized.eventType as EventType,
      minute: normalized.matchMinute,
      participant: normalized.participant,
      rawAction: normalized.rawAction,
      rawPayload: normalized.raw as Prisma.InputJsonValue,
    },
    update: {},
  });

  const round = normalized.matchMinute === null
    ? null
    : await getRoundForMinute(match.id, normalized.matchMinute);

  if (!round) {
    return { event, wonPredictions: [] };
  }

  const wonPredictions = await awardWinningPredictions(
    match.id,
    round.id,
    event.eventType,
    event.createdAt,
  );

  return { event, wonPredictions };
}

export async function closeExpiredRounds(): Promise<number> {
  const liveMatches = await prisma.match.findMany({
    where: { status: { in: [MatchStatus.OPEN, MatchStatus.LIVE] } },
    include: { rounds: true },
  });

  let resolvedCount = 0;

  for (const match of liveMatches) {
    await ensureRounds(match.id);
    const elapsedMinutes = Math.floor((Date.now() - match.startTime.getTime()) / 60_000);
    if (elapsedMinutes < 0) continue;

    const expiredRounds = match.rounds.filter(
      (round) => round.endMinute <= elapsedMinutes && round.status !== RoundStatus.RESOLVED,
    );

    for (const round of expiredRounds) {
      await resolveRoundMisses(match, round.id, round.startMinute, round.endMinute);
      await prisma.round.update({
        where: { id: round.id },
        data: { status: RoundStatus.RESOLVED },
      });
      resolvedCount += 1;
    }
  }

  return resolvedCount;
}

async function getRoundForMinute(matchId: string, minute: number) {
  const roundNumber = Math.floor(minute / ROUND_LENGTH_MINUTES) + 1;

  return prisma.round.findUnique({
    where: { matchId_number: { matchId, number: roundNumber } },
  });
}

export type ResolvedPrediction = {
  predictionId: string;
  userId: string;
  matchId: string;
  roundId: string;
  status: PredictionStatus;
  pointsAwarded: number;
  score: number;
  streak: number;
};

async function awardWinningPredictions(
  matchId: string,
  roundId: string,
  eventType: EventType,
  eventCreatedAt: Date,
): Promise<ResolvedPrediction[]> {
  if (!scoringEventTypes.has(eventType)) return [];

  const predictionType = eventTypeToPredictionType(eventType);
  const predictions = await prisma.prediction.findMany({
    where: {
      matchId,
      roundId,
      predictionType,
      status: PredictionStatus.PENDING,
      effectiveAt: { lte: eventCreatedAt },
    },
  });

  const wonPredictions: ResolvedPrediction[] = [];

  for (const prediction of predictions) {
    const state = await prisma.userMatchState.upsert({
      where: { userId_matchId: { userId: prediction.userId, matchId } },
      create: { userId: prediction.userId, matchId, score: 0, streak: 0 },
      update: {},
    });

    const nextStreak = state.streak + 1;
    const points = basePoints[prediction.predictionType] * multiplierForStreak(nextStreak);

    await prisma.$transaction([
      prisma.prediction.update({
        where: { id: prediction.id },
        data: {
          status: PredictionStatus.WON,
          pointsAwarded: points,
        },
      }),
      prisma.userMatchState.update({
        where: { id: state.id },
        data: {
          score: state.score + points,
          streak: nextStreak,
        },
      }),
    ]);

    wonPredictions.push({
      predictionId: prediction.id,
      userId: prediction.userId,
      matchId,
      roundId,
      status: PredictionStatus.WON,
      pointsAwarded: points,
      score: state.score + points,
      streak: nextStreak,
    });
  }

  return wonPredictions;
}

async function resolveRoundMisses(
  match: Match,
  roundId: string,
  startMinute: number,
  endMinute: number,
): Promise<void> {
  const pending = await prisma.prediction.findMany({
    where: {
      matchId: match.id,
      roundId,
      status: PredictionStatus.PENDING,
    },
  });

  if (pending.length === 0) return;

  const roundEvents = await prisma.event.findMany({
    where: {
      matchId: match.id,
      minute: {
        gte: startMinute,
        lt: endMinute,
      },
      eventType: { in: Array.from(scoringEventTypes) },
    },
  });
  const hasScoringEvent = roundEvents.length > 0;

  for (const prediction of pending) {
    if (prediction.predictionType === PredictionType.NOTHING_HAPPENS && !hasScoringEvent) {
      const state = await prisma.userMatchState.upsert({
        where: { userId_matchId: { userId: prediction.userId, matchId: match.id } },
        create: { userId: prediction.userId, matchId: match.id, score: 0, streak: 0 },
        update: {},
      });
      const nextStreak = state.streak + 1;
      const points = basePoints.NOTHING_HAPPENS * multiplierForStreak(nextStreak);

      await prisma.$transaction([
        prisma.prediction.update({
          where: { id: prediction.id },
          data: { status: PredictionStatus.WON, pointsAwarded: points },
        }),
        prisma.userMatchState.update({
          where: { id: state.id },
          data: { score: state.score + points, streak: nextStreak },
        }),
      ]);
      continue;
    }

    await prisma.$transaction([
      prisma.prediction.update({
        where: { id: prediction.id },
        data: { status: PredictionStatus.LOST, pointsAwarded: 0 },
      }),
      prisma.userMatchState.upsert({
        where: { userId_matchId: { userId: prediction.userId, matchId: match.id } },
        create: { userId: prediction.userId, matchId: match.id, score: 0, streak: 0 },
        update: { streak: 0 },
      }),
    ]);
  }
}

function eventTypeToPredictionType(eventType: EventType): PredictionType {
  return eventType as unknown as PredictionType;
}

function multiplierForStreak(streak: number): number {
  if (streak >= 5) return 2;
  if (streak === 4) return 1.5;
  if (streak === 3) return 1.25;
  if (streak === 2) return 1.1;
  return 1;
}
