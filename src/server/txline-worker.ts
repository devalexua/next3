import type { FastifyBaseLogger } from "fastify";
import type { Server } from "socket.io";
import { MatchStatus } from "@prisma/client";
import type { Event } from "@prisma/client";
import { parseSseChunk } from "../txline/sse.js";
import type { TxLineScoresRecord } from "../txline/types.js";
import { normalizeScoreRecord } from "../txline/normalize.js";
import { prisma } from "./prisma.js";
import { requireTxLineCredentials, serverEnv } from "./env.js";
import { presentEvent } from "./event-presenter.js";
import { ingestNormalizedEvent, closeExpiredRounds } from "./game-engine.js";

type WorkerHandle = {
  stop: () => void;
};

export function startTxLineScoresWorker(io: Server, logger: FastifyBaseLogger): WorkerHandle {
  let stopped = false;
  let abortController: AbortController | null = null;

  const run = async () => {
    while (!stopped) {
      try {
        await streamScores(io, logger, () => stopped, (controller) => {
          abortController = controller;
        });
      } catch (error) {
        if (!stopped) {
          logger.error({ error }, "TxLINE scores stream failed");
          await sleep(5_000);
        }
      }
    }
  };

  run().catch((error) => logger.error({ error }, "TxLINE worker crashed"));

  const closeTimer = setInterval(() => {
    closeExpiredRounds()
      .then((resolvedCount) => {
        if (resolvedCount > 0) {
          io.emit("round_finished", { at: new Date().toISOString(), resolvedCount });
          io.emit("leaderboard_updated", { at: new Date().toISOString() });
        }
      })
      .catch((error) => logger.error({ error }, "Round close job failed"));
  }, 3_000);

  return {
    stop: () => {
      stopped = true;
      abortController?.abort();
      clearInterval(closeTimer);
    },
  };
}

async function streamScores(
  io: Server,
  logger: FastifyBaseLogger,
  isStopped: () => boolean,
  setAbortController: (controller: AbortController) => void,
): Promise<void> {
  requireTxLineCredentials();

  const abortController = new AbortController();
  setAbortController(abortController);

  const response = await fetch(`${serverEnv.txlineBaseUrl}/api/scores/stream`, {
    headers: {
      Authorization: `Bearer ${serverEnv.txlineGuestJwt}`,
      "X-Api-Token": serverEnv.txlineApiToken,
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    signal: abortController.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`TxLINE score stream failed: ${response.status} ${response.statusText}\n${await response.text()}`);
  }

  logger.info("TxLINE scores stream connected");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let remainder = "";

  try {
    while (!isStopped()) {
      const { value, done } = await reader.read();
      if (done) return;

      const parsed = parseSseChunk(remainder + decoder.decode(value, { stream: true }));
      remainder = parsed.remainder;

      for (const message of parsed.messages) {
        if (message.event === "heartbeat" || !message.data) continue;

        const raw = JSON.parse(message.data) as TxLineScoresRecord;
        const normalized = normalizeScoreRecord(raw);
        const tracked = await getTrackedMatch(normalized.fixtureId);
        if (!tracked) continue;

        const clockUpdate = await updateMatchClockFromRecord(raw, tracked);
        if (clockUpdate) {
          io.emit("match_clock_updated", clockUpdate);
        }
        const scoreUpdate = await updateMatchScoreFromRecord(raw, tracked);
        if (scoreUpdate) {
          io.emit("match_score_updated", scoreUpdate);
        }

        const { event, wonPredictions } = await ingestNormalizedEvent(normalized);
        if (!event) continue;

        const presentedEvent = await serializeEvent(event);
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
          io.emit("leaderboard_updated", { matchId: event.matchId, at: new Date().toISOString() });
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function getTrackedMatch(fixtureId: number): Promise<{
  id: string;
  status: MatchStatus;
  participant1IsHome: boolean;
  homeScore: number;
  awayScore: number;
  clockSeconds: number;
  clockRunning: boolean;
} | null> {
  const match = await prisma.match.findUnique({
    where: { txlineFixtureId: BigInt(fixtureId) },
    select: { id: true, status: true, participant1IsHome: true, homeScore: true, awayScore: true, clockSeconds: true, clockRunning: true },
  });

  if (!match || match.status === MatchStatus.FINISHED) return null;
  return match;
}

async function updateMatchClockFromRecord(
  raw: TxLineScoresRecord,
  match: { id: string; status: MatchStatus; clockSeconds: number; clockRunning: boolean },
): Promise<{ matchId: string; status: MatchStatus; clockSeconds: number; clockRunning: boolean } | null> {
  const status = soccerStatusFromRecord(raw);
  const clock = soccerClockFromRecord(raw);
  const data: { status?: MatchStatus; clockSeconds?: number; clockRunning?: boolean } = {};

  if (status) data.status = status;
  if (clock) {
    data.clockSeconds = clock.seconds;
    data.clockRunning = clock.running;
    if (clock.running) data.status = MatchStatus.LIVE;
  }

  if (Object.keys(data).length === 0) return null;

  const nextStatus = data.status ?? match.status;
  const nextClockSeconds = data.clockSeconds ?? match.clockSeconds;
  const nextClockRunning = data.clockRunning ?? match.clockRunning;

  if (
    nextStatus === match.status &&
    nextClockSeconds === match.clockSeconds &&
    nextClockRunning === match.clockRunning
  ) {
    return null;
  }

  await prisma.match.update({ where: { id: match.id }, data });
  return {
    matchId: match.id,
    status: nextStatus,
    clockSeconds: nextClockSeconds,
    clockRunning: nextClockRunning,
  };
}

function soccerStatusFromRecord(raw: TxLineScoresRecord): MatchStatus | null {
  const statusId = getNumber(raw.statusSoccerId) ?? getNumber(raw.StatusId);
  const action = String(raw.action ?? raw.Action ?? "").toLowerCase();

  if (statusId === 3 || action === "halftime_finalised") return MatchStatus.HALF_TIME;
  if (statusId === 2 || statusId === 4) return MatchStatus.LIVE;
  if (statusId !== null && statusId >= 5) return MatchStatus.FINISHED;
  return null;
}

function soccerClockFromRecord(raw: TxLineScoresRecord): { seconds: number; running: boolean } | null {
  const clock = asObject(raw.Clock) ?? asObject((raw as { clock?: unknown }).clock);
  const seconds = getNumber(clock?.Seconds) ?? getNumber(clock?.seconds);
  const running = getBoolean(clock?.Running) ?? getBoolean(clock?.running);

  if (seconds === null || running === null) return null;
  return { seconds, running };
}

async function updateMatchScoreFromRecord(
  raw: TxLineScoresRecord,
  match: { id: string; participant1IsHome: boolean; homeScore: number; awayScore: number },
): Promise<{ matchId: string; homeScore: number; awayScore: number } | null> {
  const currentParticipant1Score = match.participant1IsHome ? match.homeScore : match.awayScore;
  const currentParticipant2Score = match.participant1IsHome ? match.awayScore : match.homeScore;
  const participant1Score = extractParticipantGoals(raw, "Participant1") ?? currentParticipant1Score;
  const participant2Score = extractParticipantGoals(raw, "Participant2") ?? currentParticipant2Score;

  if (participant1Score === currentParticipant1Score && participant2Score === currentParticipant2Score) return null;

  const homeScore = match.participant1IsHome ? participant1Score : participant2Score;
  const awayScore = match.participant1IsHome ? participant2Score : participant1Score;

  if (homeScore === match.homeScore && awayScore === match.awayScore) return null;

  await prisma.match.update({
    where: { id: match.id },
    data: { homeScore, awayScore },
  });

  return { matchId: match.id, homeScore, awayScore };
}

function extractParticipantGoals(raw: TxLineScoresRecord, participantKey: "Participant1" | "Participant2"): number | null {
  const score = asObject(raw.scoreSoccer) ?? asObject((raw as { ScoreSoccer?: unknown }).ScoreSoccer) ?? asObject(raw.Score);
  const participant = asObject(score?.[participantKey]) ?? asObject(score?.[participantKey.toLowerCase()]);
  const total = asObject(participant?.Total) ?? asObject(participant?.total);

  return getNumber(total?.Goals) ?? getNumber(total?.goals) ?? null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

function getBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

async function serializeEvent(event: Event) {
  const match = await prisma.match.findUnique({
    where: { id: event.matchId },
    select: { participant1: true, participant2: true },
  });

  if (!match) {
    return {
      ...event,
      createdAt: event.createdAt.toISOString(),
      title: event.eventType,
      subtitle: event.rawAction,
      teamName: null,
      playerName: null,
      playerId: null,
      playerInId: null,
      playerOutId: null,
    };
  }

  return presentEvent(event, match);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
