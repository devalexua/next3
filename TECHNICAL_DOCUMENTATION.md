# Next3 Technical Documentation

Next3 is a real-time football prediction game powered by TxLINE World Cup live data. Players create a lightweight account, select a live match, and submit one prediction per 3-minute round. The backend owns all TxLINE communication, game resolution, scoring, persistence, and realtime broadcasting.

This document is intended as the detailed GitHub reference for architecture, gameplay rules, local setup, deployment, and operational behavior.

## Product Summary

Next3 is not a betting platform. There is no money, wallet wagering, staking, escrow, or payout logic. It is a fan engagement game based on predictions and leaderboards.

Core user flow:

1. User registers or logs in with username and password.
2. User sees synced World Cup fixtures.
3. User either opens a public match or creates/joins a private friend room for a specific match.
4. During a live match, the user submits one prediction for the current 3-minute round.
5. TxLINE live events arrive on the backend.
6. Backend stores events, resolves predictions, updates scores/streaks, and broadcasts Socket.IO updates.
7. Frontend animates live events, score changes, prediction wins, streaks, and leaderboard updates.

## Tech Stack

Frontend:

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Framer Motion
- Socket.IO Client
- Vercel deployment

Backend:

- Node.js
- TypeScript
- Fastify
- Socket.IO
- Prisma
- PostgreSQL
- TxLINE live score stream

Infrastructure:

- Backend Docker image pushed to GitHub Container Registry
- Kubernetes backend deployment
- In-cluster PostgreSQL deployment with PVC
- UpCloud Kubernetes and LoadBalancer service
- Vercel rewrites proxy frontend API calls to the backend LoadBalancer

## Repository Layout

```text
app/                         Next.js frontend
src/server/                  Fastify backend, game engine, TxLINE worker
src/txline/                  TxLINE parsing, normalization, types
scripts/                     TxLINE auth and inspection scripts
prisma/                      Prisma schema and migrations
deployments/prod/            Kubernetes manifests
.github/workflows/           GHCR image build workflow
Dockerfile                   Backend production image
vercel.json                  Vercel rewrites to backend API
Makefile                     Kubernetes deployment helpers
```

Important files:

- `app/page.tsx`: main frontend game UI and Socket.IO client behavior.
- `src/server/index.ts`: Fastify/Socket.IO bootstrap.
- `src/server/routes.ts`: REST API routes and prediction submission rules.
- `src/server/txline-worker.ts`: persistent TxLINE score stream worker.
- `src/server/game-engine.ts`: event ingestion, scoring, streaks, prediction resolution.
- `src/server/txline.ts`: fixture sync, match status, 3-minute round creation.
- `src/server/event-presenter.ts`: enriches live events for readable UI notifications.
- `prisma/schema.prisma`: database schema.

## Data Flow

```text
TxLINE scores stream
  -> src/server/txline-worker.ts
  -> normalizeScoreRecord()
  -> game-engine ingestNormalizedEvent()
  -> PostgreSQL via Prisma
  -> Socket.IO broadcast
  -> Next.js frontend
```

Frontend never calls TxLINE directly. The backend is the only TxLINE consumer and is responsible for storing raw events and normalizing game-relevant data.

## TxLINE Integration

TxLINE credentials are required by the backend:

- `TXLINE_GUEST_JWT`
- `TXLINE_API_TOKEN`
- `TXLINE_BASE_URL`, default `https://txline.txodds.com`

Live stream endpoint:

```text
GET https://txline.txodds.com/api/scores/stream
```

Fixture and recovery snapshot endpoints:

```text
GET https://txline.txodds.com/api/fixtures/snapshot?competitionId=72
GET https://txline.txodds.com/api/scores/snapshot/<fixtureId>
```

Required headers:

```text
Authorization: Bearer <TXLINE_GUEST_JWT>
X-Api-Token: <TXLINE_API_TOKEN>
Accept: text/event-stream
```

The worker:

- Connects to the TxLINE Server-Sent Events stream.
- Ignores heartbeat messages.
- Parses each TxLINE score record.
- Normalizes event type, fixture id, TxLINE sequence, match minute, participant, and raw action.
- Checks whether the fixture belongs to a tracked match.
- Updates match score from TxLINE soccer `Stats` keys `1` and `2`, documented as Participant 1 and Participant 2 full-game total goals.
- Stores recognized live events.
- Resolves eligible predictions.
- Broadcasts updates to connected frontend clients.

Fixture metadata is synchronized at backend startup and every 5 minutes. The live stream remains the primary source for match state, score, clock, and events. Because a stream connection can miss a transition while the backend is disconnected, active matches are reconciled against their TxLINE score snapshots every minute. A snapshot record with `StatusId: 5` or `Action: game_finalised` marks the match as finished. The 20 most recent completed matches have their final scores reconciled at startup and every 10 minutes, covering fixtures imported after they ended. As a final recovery guard, a match still marked `LIVE` or `HALF_TIME` five hours after scheduled kickoff is closed locally.

`GET /api/matches` reads PostgreSQL; it does not call TxLINE directly. Finished matches are excluded from that response.

Recognized event types:

- `GOAL`
- `YELLOW_CARD`
- `RED_CARD`
- `CORNER`
- `SUBSTITUTION`
- `UNKNOWN`

Unknown events are ignored for prediction scoring but can still be useful during debugging and payload mapping work.

## Gameplay Rules

### Rounds

Each match is divided into fixed 3-minute rounds:

```text
Round 1: 0' -> 3'
Round 2: 3' -> 6'
Round 3: 6' -> 9'
...
```

The backend currently creates 30 rounds per match, covering the first 90 minutes. Round constants live in `src/server/txline.ts`:

```ts
ROUND_LENGTH_MINUTES = 3
ROUND_COUNT = 30
MATCH_DURATION_MINUTES = 90
```

Users predict the current active 3-minute round, not a future round.

Rounds are driven by the TxLINE soccer clock, not by wall-clock time since kickoff. Each clock update persists `clockSeconds`, `clockRunning`, and `clockUpdatedAt`. While the clock is running, both backend validation and the frontend countdown interpolate whole seconds from that anchor, so the timer advances every second between TxLINE feed records and is corrected by the next authoritative update. When TxLINE sends half-time status, predictions pause and interpolation stops. When TxLINE sends second-half live status, predictions resume from the new live clock anchor.

After 90 minutes, predictions close and the frontend shows the final leaderboard instead of opening more rounds.

### Prediction Options

Each user may submit one prediction per user/match/round:

- Goal
- Yellow Card
- Red Card
- Corner
- Substitution
- Nothing Happens

Database uniqueness is enforced by:

```text
Prediction @@unique([userId, matchId, roundId])
```

Private friend rooms use separate room-scoped predictions with the same gameplay rules:

```text
RoomPrediction @@unique([userId, roomId, roundId])
```

Room predictions do not update the public match leaderboard or global leaderboard. They only update the leaderboard for that room.

After a user selects a prediction, it enters a 10-second confirmation window. During that window the user may cancel it and choose a different prediction for the same round. Once the 10 seconds pass, the prediction is locked and cannot be changed or canceled.

### Anti-Sniping Delay

The backend enforces two anti-sniping rules:

- Predictions activate 10 seconds after submission.
- Predictions are closed during the final 10 seconds of each 3-minute round.

These constants live in `src/server/routes.ts`:

```ts
PREDICTION_ACTIVATION_DELAY_SECONDS = 10
PREDICTION_CLOSE_BEFORE_ROUND_END_SECONDS = 10
```

When a prediction is created, `Prediction.effectiveAt` is set to now + 10 seconds. A live event only awards a prediction if:

```text
prediction.effectiveAt <= event.createdAt
```

This prevents a player from watching a live stream, seeing an event, and immediately submitting a matching prediction.

Canceled predictions use `PredictionStatus.CANCELED` and are ignored by scoring. Because the database still enforces one row per user/round, a canceled prediction can be reused if the user submits a new prediction in the same round before predictions close.

### Scoring

Base points are defined in `src/server/game-engine.ts`:

| Prediction | Points |
|---|---:|
| Nothing Happens | 1 |
| Corner | 2 |
| Substitution | 2 |
| Yellow Card | 5 |
| Goal | 7 |
| Red Card | 20 |

The current values are weighted toward event rarity. Corners and substitutions are common, goals and cards are rarer, and red cards are very rare.

### Streak Multipliers

Successful consecutive predictions increase the user streak and apply a multiplier:

| Streak | Multiplier |
|---:|---:|
| 1 | x1 |
| 2 | x1.1 |
| 3 | x1.25 |
| 4 | x1.5 |
| 5+ | x2 |

If a prediction loses, the user streak resets to 0.

### Nothing Happens

`NOTHING_HAPPENS` is resolved when the round expires. If no scoring event type occurred during that round, the prediction wins. Otherwise it loses.

Scoring event types for resolving `NOTHING_HAPPENS`:

- Goal
- Yellow Card
- Red Card
- Corner
- Substitution

## Authentication

Authentication is intentionally lightweight for demo and hackathon use.

Features:

- Username registration
- Password login
- Passwords hashed with `bcryptjs`
- Cookie-based session

Auth routes:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
```

The session cookie is managed in `src/server/auth.ts`.

## Database Schema

Prisma models:

- `User`: username/password account.
- `Match`: TxLINE fixture metadata, teams, score, status.
- `Room`: private friend room bound to one match and a shareable room code.
- `RoomMember`: users who joined a private room.
- `Round`: fixed 3-minute match windows.
- `Prediction`: user prediction for a match round.
- `RoomPrediction`: user prediction inside a private room.
- `Event`: stored TxLINE event with raw payload.
- `UserMatchState`: per-match user score and streak.
- `RoomUserMatchState`: room-scoped user score and streak.

Key constraints:

- `Match.txlineFixtureId` is unique.
- `Round` is unique by `(matchId, number)`.
- `Prediction` is unique by `(userId, matchId, roundId)`.
- `Room.code` is unique.
- `RoomMember` is unique by `(roomId, userId)`.
- `RoomPrediction` is unique by `(userId, roomId, roundId)`.
- `Event` is unique by `(matchId, txlineSeq)` to avoid duplicate processing of the same TxLINE sequence.
- `UserMatchState` is unique by `(userId, matchId)`.
- `RoomUserMatchState` is unique by `(userId, roomId)`.

Migrations:

```text
20260624175110_init
20260624180015_scoring_float
20260625120000_match_scores
20260625123000_prediction_effective_at
20260626120000_friend_rooms
20260626123000_cancelable_predictions
```

## REST API

Health:

```text
GET /health
```

Auth:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
```

Fixtures and matches:

```text
POST /api/txline/sync-fixtures
GET  /api/matches?view=active
GET  /api/matches?view=past
GET  /api/matches?view=mine
GET  /api/matches/:id
GET  /api/matches/:id/leaderboard
GET  /api/leaderboard
```

Predictions:

```text
POST /api/matches/:id/predictions
POST /api/matches/:id/predictions/cancel
```

Friend rooms:

```text
GET  /api/rooms
POST /api/rooms
POST /api/rooms/join
GET  /api/rooms/:code
GET  /api/rooms/:code/leaderboard
POST /api/rooms/:code/predictions
POST /api/rooms/:code/predictions/cancel
```

Room creation body:

```json
{
  "matchId": "match_id",
  "name": "Optional room name"
}
```

Room join body:

```json
{
  "code": "ABC123"
}
```

Body:

```json
{
  "predictionType": "GOAL"
}
```

Admin-only test game:

```text
GET  /api/admin/test-game/status
POST /api/admin/test-game/start
POST /api/admin/test-game/stop
GET  /api/admin/demo/status
POST /api/admin/demo/start
POST /api/admin/demo/stop
```

Admin routes require:

```text
x-admin-token: <ADMIN_TEST_TOKEN>
```

## Socket.IO Events

The backend broadcasts realtime events to all connected clients.

Current emitted events:

- `event_created`: a live TxLINE or simulated event was created.
- `match_score_updated`: match score changed.
- `prediction_won`: current user may receive a win notification if it belongs to them. Room wins include `roomId`.
- `streak_updated`: user streak/score changed. Room streak updates include `roomId`.
- `leaderboard_updated`: leaderboard should be refreshed. Room updates include `roomId`.
- `round_finished`: expired rounds were resolved.
- `test_game_status`: admin test game was enabled/disabled.

Frontend event handling lives in `app/page.tsx`.

Notifications are scoped to the currently opened match screen. The main match list shows scores and match status, but live event banners are not shown there.

## Frontend Behavior

The frontend is mobile-first and game-oriented:

- Match views for live/upcoming fixtures, the current user's participated games, and recent completed fixtures.
- Match cards with status, kickoff countdown, and score. Completed matches remain openable for their feed, rounds, and final leaderboard.
- Friend room join panel and room cards for joined rooms.
- Create-room action from each match card.
- Private room match screen with shareable room code.
- Match page with animated score display.
- Current 3-minute round countdown.
- Prediction grid with base points.
- Live event timeline.
- Match leaderboard.
- Global leaderboard.
- Animated event banners and prediction success notices.

The frontend defaults to same-origin API calls:

```ts
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
```

For Vercel, `vercel.json` rewrites same-origin calls to the Kubernetes backend LoadBalancer:

```text
/health      -> backend /health
/api/*       -> backend /api/*
/socket.io/* -> backend /socket.io/*
```

This avoids browser mixed-content issues when the Vercel site is HTTPS and the temporary backend endpoint is HTTP.

## Local Development

Install dependencies:

```bash
npm install
```

Create local env:

```bash
cp .env.example .env
```

Start local PostgreSQL:

```bash
docker compose up -d postgres
```

Run migrations:

```bash
npm run prisma:migrate
```

Generate or refresh TxLINE credentials:

```bash
npm run txline:auth
```

Start backend:

```bash
npm run dev:backend
```

Start frontend:

```bash
npm run dev:frontend
```

Local URLs:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:4000
Health:   http://localhost:4000/health
```

Useful scripts:

```bash
npm run txline:fixtures
npm run txline:stream
npm run txline:snapshot
npm run build:backend
npm run build:frontend
npm run typecheck
```

## Environment Variables

Backend:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `TXLINE_GUEST_JWT` | Yes | TxLINE guest JWT |
| `TXLINE_API_TOKEN` | Yes | TxLINE activated API token |
| `TXLINE_BASE_URL` | No | Defaults to `https://txline.txodds.com` |
| `SERVER_PORT` | No | Defaults to `4000` |
| `FRONTEND_ORIGIN` | Yes in deployment | Comma-separated CORS origins |
| `ADMIN_TEST_TOKEN` | Optional | Enables admin test-game controls |

Frontend:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Optional | Explicit backend URL. Leave empty on Vercel when using rewrites. |

TxLINE token generation:

| Variable | Purpose |
|---|---|
| `SOLANA_RPC_URL` | Solana RPC endpoint |
| `SOLANA_WALLET` | Local Solana wallet JSON path |
| `TXLINE_SERVICE_LEVEL_ID` | `12` for real-time World Cup free tier |
| `TXLINE_DURATION_WEEKS` | Subscription duration |
| `TXLINE_SELECTED_LEAGUES` | Optional comma-separated league list |

## Test Game Mode

The test game simulator is admin-only and does not affect real scores, predictions, points, or leaderboards.

Frontend visibility:

```text
/?test=1
/?adminTest=1
```

Admin API calls require `x-admin-token`.

The simulator broadcasts synthetic live events only to help validate UI animations and realtime behavior during demos.

## Demo Competition Mode

Demo competition mode is designed for recording a gameplay video. Unlike the visual-only test game, this mode writes to the database and drives the real game engine:

- Creates a live `Tunisia vs Netherlands` replay match.
- Creates demo users.
- Uses `mike`, `john`, and `sara` as automated competitors while reserving `alex` for manual predictions during recording.
- Emits a compressed replay based on TxLINE historical data for fixture `17588236`.
- Persists and broadcasts the same running match-clock fields used by live TxLINE matches, so normal round and prediction validation remains active in the replay.
- Awards real points through the normal prediction resolver.
- Updates match score, event timeline, streaks, and match/global leaderboards.

The replay match is intentionally hidden from the normal match list by default. It appears in `/api/matches` only while the demo competition is actively running. Stopping the demo or reaching the end of the replay marks the replay match as `FINISHED`, which removes it from the public match list.

Demo users:

| Username | Password |
|---|---|
| `alex` | `demo123` |
| `mike` | `demo123` |
| `john` | `demo123` |
| `sara` | `demo123` |

Start the demo:

```bash
curl -X POST "$API_URL/api/admin/demo/start" \
  -H "x-admin-token: $ADMIN_TEST_TOKEN"
```

Stop the demo:

```bash
curl -X POST "$API_URL/api/admin/demo/stop" \
  -H "x-admin-token: $ADMIN_TEST_TOKEN"
```

Check status:

```bash
curl "$API_URL/api/admin/demo/status" \
  -H "x-admin-token: $ADMIN_TEST_TOKEN"
```

Recommended recording flow:

1. Log in as `alex` with password `demo123`.
2. Start demo competition from the terminal.
3. Open the `Tunisia vs Netherlands` replay match.
4. Record live events, score changes, prediction wins, streak changes, and leaderboard movement.
5. Stop the demo when recording is complete.

## Container Image

Backend image:

```text
ghcr.io/devalexua/next3-backend:latest
```

The image:

1. Installs dependencies.
2. Generates Prisma client.
3. Builds TypeScript backend into `dist/`.
4. Runs `prisma migrate deploy`.
5. Starts `node dist/src/server/index.js`.

Dockerfile:

```text
Dockerfile
```

GitHub Actions workflow:

```text
.github/workflows/docker-build-backend.yml
```

The workflow builds and pushes the backend image on pushes to `main` when backend-related files change.

## Kubernetes Deployment

Production manifests live in:

```text
deployments/prod/
```

Backend:

- `backend-deployment.yaml`
- `backend-loadbalancer-service.yaml`
- `backend-secrets.yaml.example`

PostgreSQL:

- `postgres-secret.yaml.example`
- `postgres-pvc.yaml`
- `postgres-deployment.yaml`
- `postgres-service.yaml`

Registry:

- `ghcr-secret.yaml.example`

The real secret files are gitignored:

```text
deployments/prod/backend-secrets.yaml
deployments/prod/ghcr-secret.yaml
deployments/prod/postgres-secret.yaml
```

Deployment helper:

```bash
make deploy
```

The Makefile defaults to:

```text
KUBE_CONTEXT=next3
```

Useful commands:

```bash
make deploy
make status
make logs
make restart
make deploy-lb
```

Current default exposure is via a Kubernetes LoadBalancer service:

```text
next3-backend-lb
```

The Vercel proxy currently points to the UpCloud LoadBalancer hostname in `vercel.json`.

## Vercel Deployment

Deploy the frontend from the repository root.

Vercel settings:

- Framework preset: Next.js
- Root directory: repository root
- Install command: `npm install`
- Build command: `npm run build:frontend` or Vercel default
- Output directory: default

If using `vercel.json` rewrites, do not set `NEXT_PUBLIC_API_URL`.

Useful checks after deployment:

```text
https://<vercel-app>/health
https://<vercel-app>/api/matches
```

## Operational Notes

### Backend Replicas

Keep backend replicas at `1` for now. The backend process includes the TxLINE stream worker. Scaling replicas horizontally would create multiple stream consumers and may duplicate work unless a leader election mechanism or separate worker deployment is introduced.

### PostgreSQL PVC

The Postgres deployment sets:

```text
PGDATA=/var/lib/postgresql/data/pgdata
```

This avoids initialization failures on block volumes that contain a `lost+found` directory at the mount root.

### CORS

`FRONTEND_ORIGIN` supports comma-separated origins:

```text
FRONTEND_ORIGIN=https://next3.vercel.app,https://next3-git-main-user.vercel.app
```

### Secrets

Do not commit real secrets. Only `.example` files should be tracked.

### TxLINE Resilience

The TxLINE worker retries after stream failures. Fixture metadata is refreshed every 5 minutes, active status is reconciled from score snapshots every minute, and recent finished scores are reconciled every 10 minutes. If credentials are missing or expired, backend startup can succeed but the worker and synchronization jobs will log TxLINE connection errors.

## Known Limitations And Future Improvements

- Split TxLINE worker from API deployment for horizontal scaling.
- Add leader election if multiple backend replicas are required.
- Add HTTPS directly on the backend LoadBalancer or use a real domain with cert-manager.
- Add automated tests for prediction delay, final-10-second closure, and `NOTHING_HAPPENS` resolution.
- Add richer TxLINE player/team enrichment when TxLINE payloads include complete player names.
- Add structured admin dashboard instead of URL-gated test controls.
- Add observability: metrics, centralized logs, alerting for TxLINE disconnects and DB errors.
