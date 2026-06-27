import { MatchStatus } from "@prisma/client";
import type { TxLineScoresRecord } from "../txline/types.js";

export function soccerStatusFromRecord(raw: TxLineScoresRecord): MatchStatus | null {
  const statusId = getNumber(raw.statusSoccerId) ?? getNumber(raw.StatusId);
  const action = String(raw.action ?? raw.Action ?? "").toLowerCase();

  if (action === "game_finalised" || action === "game_finalized") return MatchStatus.FINISHED;
  if (statusId === 3 || action === "halftime_finalised" || action === "halftime_finalized") {
    return MatchStatus.HALF_TIME;
  }
  if (statusId === 2 || statusId === 4) return MatchStatus.LIVE;
  if (statusId !== null && statusId >= 5) return MatchStatus.FINISHED;
  return null;
}

export function soccerClockFromRecord(raw: TxLineScoresRecord): { seconds: number; running: boolean } | null {
  const clock = asObject(raw.Clock) ?? asObject((raw as { clock?: unknown }).clock);
  const seconds = getNumber(clock?.Seconds) ?? getNumber(clock?.seconds);
  const running = getBoolean(clock?.Running) ?? getBoolean(clock?.running);

  if (seconds === null || running === null) return null;
  return { seconds, running };
}

export function soccerGoalsFromRecord(raw: TxLineScoresRecord): { participant1: number; participant2: number } | null {
  const stats = asObject(raw.stats) ?? asObject(raw.Stats);
  const participant1 = getNumber(stats?.["1"]);
  const participant2 = getNumber(stats?.["2"]);

  if (participant1 === null || participant2 === null) return null;
  return { participant1, participant2 };
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
