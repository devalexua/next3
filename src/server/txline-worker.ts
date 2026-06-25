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
  }, 15_000);

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
            streak: prediction.streak,
            score: prediction.score,
          });
        }
        if (wonPredictions.length > 0) {
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
} | null> {
  const match = await prisma.match.findUnique({
    where: { txlineFixtureId: BigInt(fixtureId) },
    select: { id: true, status: true, participant1IsHome: true, homeScore: true, awayScore: true },
  });

  if (!match || match.status === MatchStatus.FINISHED) return null;
  return match;
}

async function updateMatchScoreFromRecord(
  raw: TxLineScoresRecord,
  match: { id: string; participant1IsHome: boolean; homeScore: number; awayScore: number },
): Promise<{ matchId: string; homeScore: number; awayScore: number } | null> {
  const participant1Score = raw.scoreSoccer?.Participant1?.Total?.Goals;
  const participant2Score = raw.scoreSoccer?.Participant2?.Total?.Goals;

  if (typeof participant1Score !== "number" || typeof participant2Score !== "number") return null;

  const homeScore = match.participant1IsHome ? participant1Score : participant2Score;
  const awayScore = match.participant1IsHome ? participant2Score : participant1Score;

  if (homeScore === match.homeScore && awayScore === match.awayScore) return null;

  await prisma.match.update({
    where: { id: match.id },
    data: { homeScore, awayScore },
  });

  return { matchId: match.id, homeScore, awayScore };
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
