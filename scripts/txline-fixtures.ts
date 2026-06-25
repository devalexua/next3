import { readTxLineConfig, txLineHeaders } from "../src/txline/env.js";

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

const config = readTxLineConfig();
const url = new URL("/api/fixtures/snapshot", config.baseUrl);

if (process.env.TXLINE_START_EPOCH_DAY) {
  url.searchParams.set("startEpochDay", process.env.TXLINE_START_EPOCH_DAY);
}

if (process.env.TXLINE_COMPETITION_ID) {
  url.searchParams.set("competitionId", process.env.TXLINE_COMPETITION_ID);
}

const response = await fetch(url, {
  headers: {
    ...txLineHeaders(config),
    Accept: "application/json",
  },
});

if (!response.ok) {
  const body = await response.text().catch(() => "");
  throw new Error(`TxLINE fixtures failed: ${response.status} ${response.statusText}\n${body}`);
}

const fixtures = (await response.json()) as TxLineFixture[];
const now = Date.now();
const rows = fixtures
  .map((fixture) => ({
    fixtureId: fixture.FixtureId,
    competitionId: fixture.CompetitionId,
    competition: fixture.Competition,
    startUtc: new Date(fixture.StartTime).toISOString(),
    minutesFromNow: Math.round((fixture.StartTime - now) / 60_000),
    home: fixture.Participant1IsHome ? fixture.Participant1 : fixture.Participant2,
    away: fixture.Participant1IsHome ? fixture.Participant2 : fixture.Participant1,
  }))
  .sort((a, b) => a.startUtc.localeCompare(b.startUtc));

console.log(JSON.stringify({ count: rows.length, fixtures: rows }, null, 2));
