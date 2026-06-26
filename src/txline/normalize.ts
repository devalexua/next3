import type {
  NormalizedTxLineScoreEvent,
  TxLineScoreEventType,
  TxLineScoresRecord,
} from "./types.js";

const actionMap: Array<[RegExp, TxLineScoreEventType]> = [
  [/\bgoal\b/i, "GOAL"],
  [/\byellow[\s_-]?card\b/i, "YELLOW_CARD"],
  [/\bred[\s_-]?card\b/i, "RED_CARD"],
  [/\bcorner\b|\bcorner_(?:kick|awarded)\b/i, "CORNER"],
  [/\bsubstitution\b|\bsubstitute\b|\bplayer[\s_-]?in\b|\bplayer[\s_-]?out\b/i, "SUBSTITUTION"],
];

export function normalizeScoreRecord(record: TxLineScoresRecord): NormalizedTxLineScoreEvent {
  const data = record.dataSoccer ?? record.Data;
  const dataNew = getObject(data?.New);
  const dataPrevious = getObject(data?.Previous);
  const rawAction = [
    record.action ?? record.Action,
    record.dataSoccer?.Action ?? getString(data?.Action),
    record.dataSoccer?.Type ?? getString(data?.Type),
    record.dataSoccer?.New?.Type ?? getString(dataNew?.Type),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    eventType: mapActionToEventType(rawAction, record.action ?? record.Action),
    fixtureId: record.fixtureId ?? record.FixtureId ?? 0,
    txlineId: record.id ?? record.Id ?? 0,
    sequence: record.seq ?? record.Seq ?? 0,
    timestamp: record.ts ?? record.Ts ?? 0,
    matchMinute: getMatchMinute(record, dataNew, dataPrevious),
    participant: record.participant ?? record.Participant ?? record.dataSoccer?.Participant ?? getNumber(data?.Participant) ?? null,
    rawAction: rawAction || record.action || record.Action || "unknown",
    raw: record,
  };
}

function mapActionToEventType(action: string, primaryAction: string | undefined): TxLineScoreEventType {
  const primary = (primaryAction || "").toLowerCase();
  if (primary === "var" || primary === "score_adjustment" || primary === "action_amend") return "UNKNOWN";

  for (const [pattern, eventType] of actionMap) {
    if (pattern.test(action)) return eventType;
  }

  return "UNKNOWN";
}

function getMatchMinute(
  record: TxLineScoresRecord,
  dataNew: Record<string, unknown> | undefined,
  dataPrevious: Record<string, unknown> | undefined,
): number | null {
  const directMinute =
    record.dataSoccer?.New?.Minutes ??
    record.dataSoccer?.Previous?.Minutes ??
    getNumber(record.Data?.Minutes) ??
    getNumber(dataNew?.Minutes) ??
    getNumber(dataPrevious?.Minutes);
  if (typeof directMinute === "number") return directMinute;

  const clock = getObject(record.Data?.Clock) ?? getObject(dataNew?.Clock) ?? getObject(dataPrevious?.Clock);
  const seconds =
    record.dataSoccer?.Clock?.seconds ??
    record.dataSoccer?.Clock?.Seconds ??
    record.dataSoccer?.New?.Clock?.seconds ??
    record.dataSoccer?.New?.Clock?.Seconds ??
    record.Clock?.Seconds ??
    record.Clock?.seconds ??
    getNumber(clock?.Seconds) ??
    getNumber(clock?.seconds);
  if (typeof seconds === "number") return Math.floor(seconds / 60);

  return null;
}

function getObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
