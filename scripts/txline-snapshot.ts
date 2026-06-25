import { readTxLineConfig, txLineHeaders } from "../src/txline/env.js";
import { normalizeScoreRecord } from "../src/txline/normalize.js";
import type { TxLineScoresRecord } from "../src/txline/types.js";

const config = readTxLineConfig();

if (!config.fixtureId) {
  throw new Error("TXLINE_FIXTURE_ID is required for snapshots.");
}

const url = new URL(`/api/scores/snapshot/${config.fixtureId}`, config.baseUrl);
const asOf = process.env.TXLINE_AS_OF;
if (asOf) {
  url.searchParams.set("asOf", asOf);
}

const response = await fetch(url, {
  headers: {
    ...txLineHeaders(config),
    Accept: "application/json",
  },
});

if (!response.ok) {
  const body = await response.text().catch(() => "");
  throw new Error(`TxLINE snapshot failed: ${response.status} ${response.statusText}\n${body}`);
}

const records = (await response.json()) as TxLineScoresRecord[];

console.log(
  JSON.stringify(
    {
      fixtureId: config.fixtureId,
      count: records.length,
      normalized: records.map(normalizeScoreRecord),
    },
    null,
    2,
  ),
);
