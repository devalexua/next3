import type { Event, Match } from "@prisma/client";

type MatchTeamInfo = Pick<Match, "participant1" | "participant2">;

export type PresentedEvent = {
  id: string;
  matchId: string;
  txlineSeq: number;
  txlineId: number;
  eventType: string;
  minute: number | null;
  participant: number | null;
  rawAction: string;
  createdAt: string;
  title: string;
  subtitle: string;
  teamName: string | null;
  playerName: string | null;
  playerId: number | null;
  playerInId: number | null;
  playerOutId: number | null;
};

export function presentEvent(event: Event, match: MatchTeamInfo): PresentedEvent {
  const payload = asObject(event.rawPayload);
  const data = asObject(payload?.Data) ?? asObject(payload?.dataSoccer);
  const teamName = getTeamName(event.participant, match);
  const playerName = findFirstString(data, ["PlayerName", "ScorerName", "CardedPlayerName", "Name"]);
  const playerId = findFirstNumber(data, ["PlayerId"]);
  const playerInId = findFirstNumber(data, ["PlayerInId"]);
  const playerOutId = findFirstNumber(data, ["PlayerOutId"]);
  const playerLabel = playerName;
  const teamLabel = teamName ?? "Unknown team";

  return {
    id: event.id,
    matchId: event.matchId,
    txlineSeq: event.txlineSeq,
    txlineId: event.txlineId,
    eventType: event.eventType,
    minute: event.minute,
    participant: event.participant,
    rawAction: event.rawAction,
    createdAt: event.createdAt.toISOString(),
    title: titleForEvent(event.eventType),
    subtitle: subtitleForEvent(event.eventType, teamLabel, playerLabel, playerInId, playerOutId),
    teamName,
    playerName,
    playerId,
    playerInId,
    playerOutId,
  };
}

function titleForEvent(eventType: string): string {
  if (eventType === "YELLOW_CARD") return "Yellow Card";
  if (eventType === "RED_CARD") return "Red Card";
  if (eventType === "NOTHING_HAPPENS") return "Nothing Happens";
  return eventType
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function subtitleForEvent(
  eventType: string,
  teamName: string,
  playerLabel: string | null,
  playerInId: number | null,
  playerOutId: number | null,
): string {
  if (eventType === "GOAL") {
    return playerLabel ? `${playerLabel} scores for ${teamName}` : `${teamName} scores`;
  }

  if (eventType === "CORNER") {
    return `${teamName} earned a corner`;
  }

  if (eventType === "YELLOW_CARD") {
    return playerLabel ? `${playerLabel} booked for ${teamName}` : `${teamName} receives a yellow card`;
  }

  if (eventType === "RED_CARD") {
    return playerLabel ? `${playerLabel} sent off for ${teamName}` : `${teamName} receives a red card`;
  }

  if (eventType === "SUBSTITUTION") {
    return `${teamName} makes a substitution`;
  }

  return teamName;
}

function getTeamName(participant: number | null, match: MatchTeamInfo): string | null {
  if (participant === 1) return match.participant1;
  if (participant === 2) return match.participant2;
  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function findFirstString(source: Record<string, unknown> | null, keys: string[]): string | null {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function findFirstNumber(source: Record<string, unknown> | null, keys: string[]): number | null {
  if (!source) return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number") return value;
  }

  return null;
}
