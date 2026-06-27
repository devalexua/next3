import { MatchStatus, type Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { requireTxLineCredentials, serverEnv } from "./env.js";
import type { TxLineScoresRecord } from "../txline/types.js";
import { soccerGoalsFromRecord, soccerStatusFromRecord } from "./txline-state.js";
import { demoFixtureId } from "./constants.js";

type TxLineFixture = {
  Ts: number;
  StartTime: number;
  Competition: string;
  CompetitionId: number;
  FixtureGroupId: number;
  Participant1Id: number;
  Participant1: string;
  Participant2Id: number;
  Participant2: string;
  FixtureId: number;
  Participant1IsHome: boolean;
};

export const ROUND_LENGTH_MINUTES = 3;
export const MATCH_DURATION_MINUTES = 90;
const ROUND_COUNT = 30;
const STALE_LIVE_MATCH_MS = 5 * 60 * 60_000;

export async function syncFixtures(): Promise<{ imported: number }> {
  requireTxLineCredentials();

  const response = await fetch(`${serverEnv.txlineBaseUrl}/api/fixtures/snapshot?competitionId=72`, {
    headers: txLineHeaders(),
  });

  if (!response.ok) {
    throw new Error(`TxLINE fixtures failed: ${response.status} ${response.statusText}\n${await response.text()}`);
  }

  const fixtures = (await response.json()) as TxLineFixture[];
  let imported = 0;

  for (const fixture of fixtures) {
    const homeTeam = fixture.Participant1IsHome ? fixture.Participant1 : fixture.Participant2;
    const awayTeam = fixture.Participant1IsHome ? fixture.Participant2 : fixture.Participant1;
    const startTime = new Date(fixture.StartTime);
    const status = deriveMatchStatus(startTime);

    await prisma.match.upsert({
      where: { txlineFixtureId: BigInt(fixture.FixtureId) },
      create: {
        txlineFixtureId: BigInt(fixture.FixtureId),
        competitionId: fixture.CompetitionId,
        competition: fixture.Competition,
        fixtureGroupId: fixture.FixtureGroupId,
        homeTeam,
        awayTeam,
        participant1: fixture.Participant1,
        participant2: fixture.Participant2,
        participant1IsHome: fixture.Participant1IsHome,
        startTime,
        status,
      },
      update: {
        competitionId: fixture.CompetitionId,
        competition: fixture.Competition,
        fixtureGroupId: fixture.FixtureGroupId,
        homeTeam,
        awayTeam,
        participant1: fixture.Participant1,
        participant2: fixture.Participant2,
        participant1IsHome: fixture.Participant1IsHome,
        startTime,
      },
    });

    imported += 1;
  }

  return { imported };
}

export function deriveMatchStatus(startTime: Date): MatchStatus {
  const now = Date.now();
  const start = startTime.getTime();
  const openAt = start;

  if (now >= start) return MatchStatus.LIVE;
  if (now >= openAt) return MatchStatus.OPEN;
  return MatchStatus.SCHEDULED;
}

export async function refreshMatchStatuses(): Promise<void> {
  const matches = await prisma.match.findMany({
    where: { status: { in: [MatchStatus.SCHEDULED, MatchStatus.OPEN] } },
    select: { id: true, startTime: true, status: true },
  });

  for (const match of matches) {
    const status = deriveMatchStatus(match.startTime);
    if (status !== match.status) {
      await prisma.match.update({ where: { id: match.id }, data: { status } });
    }
  }

  await prisma.match.updateMany({
    where: {
      status: { in: [MatchStatus.LIVE, MatchStatus.HALF_TIME] },
      startTime: { lte: new Date(Date.now() - STALE_LIVE_MATCH_MS) },
    },
    data: { status: MatchStatus.FINISHED, clockRunning: false },
  });
}

export async function reconcileActiveMatchStatuses(): Promise<{ checked: number; updated: number }> {
  requireTxLineCredentials();

  const matches = await prisma.match.findMany({
    where: { status: { in: [MatchStatus.LIVE, MatchStatus.HALF_TIME] } },
    select: {
      id: true,
      txlineFixtureId: true,
      status: true,
      participant1IsHome: true,
      homeScore: true,
      awayScore: true,
    },
  });

  let updated = 0;
  await Promise.all(
    matches.map(async (match) => {
      const records = (await fetchScoreSnapshot(match.txlineFixtureId)).sort(compareTxLineRecords);
      const statusRecord = records
        .filter((record) => soccerStatusFromRecord(record) !== null)
        .at(-1);
      const status = statusRecord ? soccerStatusFromRecord(statusRecord) : null;
      const goals = latestSnapshotGoals(records);
      const homeScore = goals
        ? match.participant1IsHome ? goals.participant1 : goals.participant2
        : match.homeScore;
      const awayScore = goals
        ? match.participant1IsHome ? goals.participant2 : goals.participant1
        : match.awayScore;

      if ((!status || status === match.status) && homeScore === match.homeScore && awayScore === match.awayScore) return;

      await prisma.match.update({
        where: { id: match.id },
        data: {
          ...(status ? { status } : {}),
          ...(status === MatchStatus.FINISHED ? { clockRunning: false } : {}),
          homeScore,
          awayScore,
        },
      });
      updated += 1;
    }),
  );

  return { checked: matches.length, updated };
}

export async function reconcileRecentFinishedMatchScores(): Promise<{ checked: number; updated: number }> {
  requireTxLineCredentials();

  const matches = await prisma.match.findMany({
    where: {
      status: MatchStatus.FINISHED,
      txlineFixtureId: { not: BigInt(demoFixtureId) },
    },
    orderBy: { startTime: "desc" },
    take: 20,
    select: {
      id: true,
      txlineFixtureId: true,
      participant1IsHome: true,
      homeScore: true,
      awayScore: true,
    },
  });

  let updated = 0;
  await Promise.all(
    matches.map(async (match) => {
      const records = (await fetchScoreSnapshot(match.txlineFixtureId)).sort(compareTxLineRecords);
      const goals = latestSnapshotGoals(records);
      if (!goals) return;

      const homeScore = match.participant1IsHome ? goals.participant1 : goals.participant2;
      const awayScore = match.participant1IsHome ? goals.participant2 : goals.participant1;
      if (homeScore === match.homeScore && awayScore === match.awayScore) return;

      await prisma.match.update({ where: { id: match.id }, data: { homeScore, awayScore } });
      updated += 1;
    }),
  );

  return { checked: matches.length, updated };
}

async function fetchScoreSnapshot(fixtureId: bigint): Promise<TxLineScoresRecord[]> {
  const response = await fetch(`${serverEnv.txlineBaseUrl}/api/scores/snapshot/${fixtureId}`, {
    headers: txLineHeaders(),
  });

  if (!response.ok) {
    throw new Error(`TxLINE score snapshot ${fixtureId} failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as TxLineScoresRecord[];
}

function latestSnapshotGoals(records: TxLineScoresRecord[]): { participant1: number; participant2: number } | null {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record) continue;
    const goals = soccerGoalsFromRecord(record);
    if (goals) return goals;
  }
  return null;
}

function compareTxLineRecords(left: TxLineScoresRecord, right: TxLineScoresRecord): number {
  return (left.ts ?? left.Ts ?? 0) - (right.ts ?? right.Ts ?? 0)
    || (left.seq ?? left.Seq ?? 0) - (right.seq ?? right.Seq ?? 0);
}

export async function ensureRounds(matchId: string): Promise<void> {
  const existing = await prisma.round.findMany({
    where: { matchId },
    select: { id: true, number: true, startMinute: true, endMinute: true },
    orderBy: { number: "asc" },
  });

  const hasCurrentRoundShape =
    existing.length === ROUND_COUNT &&
    existing.every((round) => {
      const expectedStart = (round.number - 1) * ROUND_LENGTH_MINUTES;
      return round.startMinute === expectedStart && round.endMinute === expectedStart + ROUND_LENGTH_MINUTES;
    });

  if (hasCurrentRoundShape) return;

  if (existing.length > 0) {
    const existingNumbers = new Set(existing.map((round) => round.number));

    await prisma.$transaction(
      existing.map((round) => {
        const startMinute = (round.number - 1) * ROUND_LENGTH_MINUTES;

        return prisma.round.update({
          where: { id: round.id },
          data: {
            startMinute,
            endMinute: startMinute + ROUND_LENGTH_MINUTES,
          },
        });
      }),
    );

    const missingData: Prisma.RoundCreateManyInput[] = [];
    for (let number = 1; number <= ROUND_COUNT; number += 1) {
      if (existingNumbers.has(number)) continue;

      const startMinute = (number - 1) * ROUND_LENGTH_MINUTES;
      missingData.push({
        matchId,
        number,
        startMinute,
        endMinute: startMinute + ROUND_LENGTH_MINUTES,
      });
    }

    if (missingData.length > 0) {
      await prisma.round.createMany({ data: missingData, skipDuplicates: true });
    }

    await prisma.round.deleteMany({
      where: {
        matchId,
        number: { gt: ROUND_COUNT },
        predictions: { none: {} },
      },
    });

    return;
  }

  const data: Prisma.RoundCreateManyInput[] = [];
  for (let number = 1; number <= ROUND_COUNT; number += 1) {
    const startMinute = (number - 1) * ROUND_LENGTH_MINUTES;
    data.push({
      matchId,
      number,
      startMinute,
      endMinute: startMinute + ROUND_LENGTH_MINUTES,
    });
  }

  await prisma.round.createMany({ data, skipDuplicates: true });
}

function txLineHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${serverEnv.txlineGuestJwt}`,
    "X-Api-Token": serverEnv.txlineApiToken,
    Accept: "application/json",
  };
}
