# Next3 TxLINE Probe

Initial read-only integration for inspecting TxLINE World Cup score payloads.

For the full project architecture, gameplay rules, API reference, deployment flow,
and operational notes, see [TECHNICAL_DOCUMENTATION.md](./TECHNICAL_DOCUMENTATION.md).

## TxLINE Endpoints

- Scores stream: `GET https://txline.txodds.com/api/scores/stream`
- Score snapshot: `GET https://txline.txodds.com/api/scores/snapshot/{fixtureId}`

Both require:

- `Authorization: Bearer <guest JWT>`
- `X-Api-Token: <activated API token>`

The scores stream is Server-Sent Events. Data messages include one TxLINE `Scores`
record in the `data` field; heartbeat messages use `event: heartbeat`.

## Run

```bash
npm install
cp .env.example .env
```

Start local Postgres:

```bash
docker compose up -d postgres
npm run prisma:migrate
```

Generate TxLINE tokens with the local Solana wallet:

```bash
npm run txline:auth
```

Defaults:

- `SOLANA_WALLET=/Users/oleksandr/.config/solana/id.json`
- `SOLANA_RPC_URL=https://api.mainnet-beta.solana.com`
- `TXLINE_SERVICE_LEVEL_ID=12` for World Cup real-time free tier
- `TXLINE_DURATION_WEEKS=4`

The wallet needs enough SOL for transaction fees. The free World Cup tier does
not require TxL payment.

The command writes these values into `.env`:

```bash
TXLINE_GUEST_JWT=...
TXLINE_API_TOKEN=...
```

Capture the next score events:

```bash
TXLINE_MAX_MESSAGES=5 npm run txline:stream
```

Filter to one fixture:

```bash
TXLINE_FIXTURE_ID=123 npm run txline:stream
```

Fetch the latest score-event snapshots for one fixture:

```bash
TXLINE_FIXTURE_ID=123 npm run txline:snapshot
```

## Payload Shape We Expect

The first normalized layer keeps the raw TxLINE record and extracts only fields
needed by Next3:

- `fixtureId`
- `txlineId`
- `sequence`
- `timestamp`
- `matchMinute`
- `participant`
- `rawAction`
- `eventType`: `GOAL`, `YELLOW_CARD`, `RED_CARD`, `CORNER`, `SUBSTITUTION`, or `UNKNOWN`
- `raw`: untouched TxLINE score record

We should run this against a live or replayed fixture before finalizing the game
engine mapping, especially for substitutions and cards.
