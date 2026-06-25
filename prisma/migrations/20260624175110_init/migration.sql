-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'OPEN', 'LIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('UPCOMING', 'LOCKED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PredictionType" AS ENUM ('GOAL', 'YELLOW_CARD', 'RED_CARD', 'CORNER', 'SUBSTITUTION', 'NOTHING_HAPPENS');

-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('PENDING', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('GOAL', 'YELLOW_CARD', 'RED_CARD', 'CORNER', 'SUBSTITUTION', 'UNKNOWN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "txlineFixtureId" BIGINT NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "competition" TEXT NOT NULL,
    "fixtureGroupId" INTEGER NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "participant1" TEXT NOT NULL,
    "participant2" TEXT NOT NULL,
    "participant1IsHome" BOOLEAN NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'UPCOMING',

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "predictionType" "PredictionType" NOT NULL,
    "status" "PredictionStatus" NOT NULL DEFAULT 'PENDING',
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "txlineSeq" INTEGER NOT NULL,
    "txlineId" INTEGER NOT NULL,
    "eventType" "EventType" NOT NULL,
    "minute" INTEGER,
    "participant" INTEGER,
    "rawAction" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMatchState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMatchState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Match_txlineFixtureId_key" ON "Match"("txlineFixtureId");

-- CreateIndex
CREATE INDEX "Match_startTime_idx" ON "Match"("startTime");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Round_matchId_number_key" ON "Round"("matchId", "number");

-- CreateIndex
CREATE INDEX "Prediction_matchId_roundId_idx" ON "Prediction"("matchId", "roundId");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_userId_matchId_roundId_key" ON "Prediction"("userId", "matchId", "roundId");

-- CreateIndex
CREATE INDEX "Event_matchId_createdAt_idx" ON "Event"("matchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_matchId_txlineSeq_key" ON "Event"("matchId", "txlineSeq");

-- CreateIndex
CREATE INDEX "UserMatchState_matchId_score_idx" ON "UserMatchState"("matchId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "UserMatchState_userId_matchId_key" ON "UserMatchState"("userId", "matchId");

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMatchState" ADD CONSTRAINT "UserMatchState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMatchState" ADD CONSTRAINT "UserMatchState_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
