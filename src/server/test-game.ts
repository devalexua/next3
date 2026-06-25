import { EventType } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import type { Server } from "socket.io";
import { ROUND_LENGTH_MINUTES } from "./txline.js";

type TestGameStatus = {
  enabled: boolean;
  matchId: string | null;
  startedAt: string | null;
  minute: number;
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

export type TestGameController = {
  start: (matchId: string) => TestGameStatus;
  stop: () => TestGameStatus;
  status: () => TestGameStatus;
};

export function createTestGameController(io: Server, logger: FastifyBaseLogger): TestGameController {
  let activeMatchId: string | null = null;
  let startedAt: Date | null = null;
  let minute = 0;
  let timer: NodeJS.Timeout | null = null;
  let sequence = 0;

  const emitStatus = () => {
    io.emit("test_game_status", getStatus());
  };

  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
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

function subtitleForEvent(eventType: EventType, teamName: string): string {
  if (eventType === EventType.GOAL) return `${teamName} scores`;
  if (eventType === EventType.CORNER) return `${teamName} earned a corner`;
  if (eventType === EventType.YELLOW_CARD) return `${teamName} receives a yellow card`;
  if (eventType === EventType.RED_CARD) return `${teamName} receives a red card`;
  if (eventType === EventType.SUBSTITUTION) return `${teamName} makes a substitution`;
  return teamName;
}
