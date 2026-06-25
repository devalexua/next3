import { MatchStatus, PredictionStatus, PredictionType, type Event } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { clearSession, getCurrentUser, hashPassword, requireUser, setSession, verifyPassword } from "./auth.js";
import { serverEnv } from "./env.js";
import { presentEvent } from "./event-presenter.js";
import { prisma } from "./prisma.js";
import type { TestGameController } from "./test-game.js";
import { ensureRounds, refreshMatchStatuses, ROUND_LENGTH_MINUTES, syncFixtures } from "./txline.js";

type AuthBody = {
  username?: string;
  password?: string;
};

type PredictionBody = {
  predictionType?: PredictionType;
};

type TestGameBody = {
  matchId?: string;
};

const PREDICTION_ACTIVATION_DELAY_SECONDS = 10;
const PREDICTION_CLOSE_BEFORE_ROUND_END_SECONDS = 10;

export function registerRoutes(app: FastifyInstance, testGame: TestGameController): void {
  app.get("/health", async () => ({ ok: true }));

  app.post("/api/auth/register", async (request, reply) => {
    const body = request.body as AuthBody;
    const username = normalizeUsername(body.username);
    const password = body.password || "";

    if (!username || password.length < 6) {
      return reply.code(400).send({ error: "Username and password of at least 6 characters are required." });
    }

    const existingUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (existingUser) {
      return reply.code(409).send({ error: "Username is already taken." });
    }

    const user = await prisma.user.create({
      data: { username, passwordHash: await hashPassword(password) },
      select: { id: true, username: true, createdAt: true },
    });

    await setSession(reply, user.id);
    return { user };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = request.body as AuthBody;
    const username = normalizeUsername(body.username);
    const password = body.password || "";
    const user = username
      ? await prisma.user.findUnique({ where: { username } })
      : null;

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "Invalid username or password." });
    }

    await setSession(reply, user.id);
    return { user: { id: user.id, username: user.username, createdAt: user.createdAt } };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  app.get("/api/me", async (request) => ({ user: await getCurrentUser(request) }));

  app.post("/api/txline/sync-fixtures", async () => {
    const result = await syncFixtures();
    await refreshMatchStatuses();
    return result;
  });

  app.get("/api/admin/test-game/status", async () => testGame.status());

  app.post("/api/admin/test-game/start", async (request, reply) => {
    if (!isAdminRequest(request.headers["x-admin-token"])) {
      return reply.code(401).send({ error: "Admin test token is required." });
    }

    const body = request.body as TestGameBody;
    if (!body.matchId) {
      return reply.code(400).send({ error: "matchId is required." });
    }

    const match = await prisma.match.findUnique({ where: { id: body.matchId }, select: { id: true } });
    if (!match) return reply.code(404).send({ error: "Match not found." });

    return testGame.start(match.id);
  });

  app.post("/api/admin/test-game/stop", async (request, reply) => {
    if (!isAdminRequest(request.headers["x-admin-token"])) {
      return reply.code(401).send({ error: "Admin test token is required." });
    }

    return testGame.stop();
  });

  app.get("/api/matches", async () => {
    await refreshMatchStatuses();
    const matches = await prisma.match.findMany({
      where: { status: { not: MatchStatus.FINISHED } },
      orderBy: { startTime: "asc" },
      take: 40,
    });

    return { matches: matches.map(serializeMatch) };
  });

  app.get("/api/matches/:id", async (request, reply) => {
    await refreshMatchStatuses();
    const { id } = request.params as { id: string };
    const user = await getCurrentUser(request);
    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        rounds: { orderBy: { number: "asc" } },
        events: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    });

    if (!match) return reply.code(404).send({ error: "Match not found." });
    await ensureRounds(match.id);

    const rounds = await prisma.round.findMany({
      where: { matchId: match.id },
      orderBy: { number: "asc" },
    });
    const myPredictions = user
      ? await prisma.prediction.findMany({
          where: { userId: user.id, matchId: match.id },
          include: { round: true },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const myState = user
      ? await prisma.userMatchState.findUnique({
          where: { userId_matchId: { userId: user.id, matchId: match.id } },
        })
      : null;

    return {
      match: serializeMatch(match),
      rounds,
      activePredictionRound: getPredictionRound(match.startTime, rounds),
      currentRound: getCurrentRound(match.startTime, rounds),
      events: dedupeEvents(match.events).map((event) => presentEvent(event, match)),
      myPredictions,
      myState,
    };
  });

  app.get("/api/matches/:id/leaderboard", async (request, reply) => {
    const { id } = request.params as { id: string };
    const match = await prisma.match.findUnique({ where: { id }, select: { id: true } });

    if (!match) return reply.code(404).send({ error: "Match not found." });

    const rows = await prisma.userMatchState.findMany({
      where: { matchId: id },
      include: { user: { select: { username: true } } },
      orderBy: [{ score: "desc" }, { updatedAt: "asc" }],
      take: 50,
    });

    return {
      leaderboard: rows.map((row, index) => ({
        rank: index + 1,
        username: row.user.username,
        score: row.score,
        streak: row.streak,
      })),
    };
  });

  app.get("/api/leaderboard", async () => {
    const rows = await prisma.user.findMany({
      select: {
        username: true,
        matchStates: { select: { score: true, streak: true } },
      },
      take: 100,
    });

    const leaderboard = rows
      .map((row) => ({
        username: row.username,
        score: row.matchStates.reduce((total, state) => total + state.score, 0),
        bestStreak: row.matchStates.reduce((best, state) => Math.max(best, state.streak), 0),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username))
      .slice(0, 50)
      .map((row, index) => ({ rank: index + 1, ...row }));

    return { leaderboard };
  });

  app.post("/api/matches/:id/predictions", async (request, reply) => {
    const user = await requireUser(request);
    await refreshMatchStatuses();
    const { id } = request.params as { id: string };
    const body = request.body as PredictionBody;

    if (!body.predictionType || !(body.predictionType in PredictionType)) {
      return reply.code(400).send({ error: "Invalid prediction type." });
    }

    const match = await prisma.match.findUnique({
      where: { id },
      include: { rounds: { orderBy: { number: "asc" } } },
    });

    if (!match) return reply.code(404).send({ error: "Match not found." });
    if (match.status !== MatchStatus.OPEN && match.status !== MatchStatus.LIVE) {
      return reply.code(409).send({ error: "Predictions open when the match starts." });
    }

    await ensureRounds(match.id);
    const rounds = match.rounds.length > 0
      ? match.rounds
      : await prisma.round.findMany({ where: { matchId: match.id }, orderBy: { number: "asc" } });
    const round = getPredictionRound(match.startTime, rounds);

    if (!round) {
      return reply.code(409).send({ error: "No prediction round is currently open." });
    }

    const roundEndsAt = match.startTime.getTime() + round.endMinute * 60_000;
    const now = Date.now();
    if (roundEndsAt - now <= PREDICTION_CLOSE_BEFORE_ROUND_END_SECONDS * 1000) {
      return reply.code(409).send({ error: "Predictions are closed for the final 10 seconds of each round." });
    }

    const existingPrediction = await prisma.prediction.findUnique({
      where: { userId_matchId_roundId: { userId: user.id, matchId: match.id, roundId: round.id } },
      select: { id: true, status: true },
    });

    if (existingPrediction && existingPrediction.status !== PredictionStatus.PENDING) {
      return reply.code(409).send({ error: "This round has already been resolved." });
    }

    const effectiveAt = new Date(now + PREDICTION_ACTIVATION_DELAY_SECONDS * 1000);
    const prediction = await prisma.prediction.upsert({
      where: { userId_matchId_roundId: { userId: user.id, matchId: match.id, roundId: round.id } },
      create: {
        userId: user.id,
        matchId: match.id,
        roundId: round.id,
        predictionType: body.predictionType,
        effectiveAt,
      },
      update: { predictionType: body.predictionType, effectiveAt },
    });

    return { prediction, activationDelaySeconds: PREDICTION_ACTIVATION_DELAY_SECONDS };
  });
}

function normalizeUsername(username: string | undefined): string {
  return (username || "").trim().toLowerCase();
}

function isAdminRequest(token: string | string[] | undefined): boolean {
  if (!serverEnv.adminTestToken) return false;
  const value = Array.isArray(token) ? token[0] : token;
  return value === serverEnv.adminTestToken;
}

function serializeMatch(match: {
  id: string;
  txlineFixtureId: bigint;
  competitionId: number;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  startTime: Date;
  status: MatchStatus;
}) {
  return {
    ...match,
    txlineFixtureId: match.txlineFixtureId.toString(),
    startTime: match.startTime.toISOString(),
    opensAt: match.startTime.toISOString(),
  };
}

function dedupeEvents(events: Event[]): Event[] {
  const accepted: Event[] = [];

  for (const event of events) {
    const duplicate = accepted.some((acceptedEvent) => {
      if (acceptedEvent.eventType !== event.eventType) return false;
      if (acceptedEvent.minute !== event.minute) return false;
      if (acceptedEvent.participant !== event.participant) return false;
      if (acceptedEvent.rawAction !== event.rawAction) return false;

      return Math.abs(acceptedEvent.createdAt.getTime() - event.createdAt.getTime()) < 90_000;
    });

    if (!duplicate) accepted.push(event);
  }

  return accepted;
}

function getPredictionRound(startTime: Date, rounds: Array<{ id: string; number: number; startMinute: number; endMinute: number }>) {
  const now = Date.now();
  const kickoff = startTime.getTime();

  if (now < kickoff) return null;

  const elapsedMinute = Math.floor((now - kickoff) / 60_000);
  const currentRoundNumber = Math.floor(elapsedMinute / ROUND_LENGTH_MINUTES) + 1;
  return rounds.find((round) => round.number === currentRoundNumber) ?? null;
}

function getCurrentRound(startTime: Date, rounds: Array<{ id: string; number: number; startMinute: number; endMinute: number }>) {
  const now = Date.now();
  const kickoff = startTime.getTime();

  if (now < kickoff) return null;

  const elapsedMinute = Math.floor((now - kickoff) / 60_000);
  const currentRoundNumber = Math.floor(elapsedMinute / ROUND_LENGTH_MINUTES) + 1;
  return rounds.find((round) => round.number === currentRoundNumber) ?? null;
}
