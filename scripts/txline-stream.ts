import { readTxLineConfig, txLineHeaders } from "../src/txline/env.js";
import { normalizeScoreRecord } from "../src/txline/normalize.js";
import { parseSseChunk } from "../src/txline/sse.js";
import type { TxLineScoresRecord } from "../src/txline/types.js";

const config = readTxLineConfig();
const maxMessages = Number(process.env.TXLINE_MAX_MESSAGES || 10);
const timeoutMs = Number(process.env.TXLINE_STREAM_TIMEOUT_MS || 30_000);

const url = new URL("/api/scores/stream", config.baseUrl);
if (config.fixtureId) {
  url.searchParams.set("fixtureId", config.fixtureId);
}

const abort = new AbortController();
const timer = setTimeout(() => abort.abort(), timeoutMs);

try {
  const response = await fetch(url, {
    headers: {
      ...txLineHeaders(config),
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    signal: abort.signal,
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw new Error(`TxLINE stream failed: ${response.status} ${response.statusText}\n${body}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let remainder = "";
  let received = 0;

  while (received < maxMessages) {
    const { value, done } = await reader.read();
    if (done) break;

    const parsed = parseSseChunk(remainder + decoder.decode(value, { stream: true }));
    remainder = parsed.remainder;

    for (const message of parsed.messages) {
      if (message.event === "heartbeat") {
        console.log(JSON.stringify({ kind: "heartbeat", id: message.id, data: parseJson(message.data) }, null, 2));
        continue;
      }

      if (!message.data) continue;

      const raw = JSON.parse(message.data) as TxLineScoresRecord;
      console.log(
        JSON.stringify(
          {
            kind: "score",
            sseId: message.id,
            normalized: normalizeScoreRecord(raw),
          },
          null,
          2,
        ),
      );

      received += 1;
      if (received >= maxMessages) break;
    }
  }

  reader.releaseLock();
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") {
    console.error(`Stopped after ${timeoutMs}ms without receiving ${maxMessages} score messages.`);
  } else {
    throw error;
  }
} finally {
  clearTimeout(timer);
  abort.abort();
}

function parseJson(value: string | undefined): unknown {
  if (!value) return undefined;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
