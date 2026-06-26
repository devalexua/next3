import { MatchStatus, type Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { requireTxLineCredentials, serverEnv } from "./env.js";

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
        status,
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
  const finishAt = start + MATCH_DURATION_MINUTES * 60_000;

  if (now >= finishAt) return MatchStatus.FINISHED;
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
