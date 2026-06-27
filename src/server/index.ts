import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { Server } from "socket.io";
import { serverEnv } from "./env.js";
import { registerRoutes } from "./routes.js";
import { createTestGameController } from "./test-game.js";
import {
  reconcileActiveMatchStatuses,
  reconcileRecentFinishedMatchScores,
  refreshMatchStatuses,
  syncFixtures,
} from "./txline.js";
import { startTxLineScoresWorker } from "./txline-worker.js";

const app = Fastify({ logger: true });
const io = new Server(app.server, {
  cors: {
    origin: serverEnv.frontendOrigins,
    credentials: true,
  },
});

await app.register(cors, {
  origin: serverEnv.frontendOrigins,
  credentials: true,
});
await app.register(cookie);

const testGame = createTestGameController(io, app.log);

registerRoutes(app, testGame);

io.on("connection", (socket) => {
  socket.emit("connected", { ok: true });
});

const txlineWorker = startTxLineScoresWorker(io, app.log);

setInterval(() => {
  refreshMatchStatuses().catch((error) => app.log.error(error));
}, 30_000);

setInterval(() => {
  syncFixtures().catch((error) => app.log.warn({ error }, "TxLINE fixture sync failed"));
}, 5 * 60_000);

setInterval(() => {
  reconcileActiveMatchStatuses()
    .then(({ checked, updated }) => {
      if (updated > 0) app.log.info({ checked, updated }, "TxLINE match statuses reconciled");
    })
    .catch((error) => app.log.warn({ error }, "TxLINE match status reconciliation failed"));
}, 60_000);

setInterval(() => {
  reconcileRecentFinishedMatchScores()
    .then(({ checked, updated }) => {
      if (updated > 0) app.log.info({ checked, updated }, "TxLINE finished scores reconciled");
    })
    .catch((error) => app.log.warn({ error }, "TxLINE finished score reconciliation failed"));
}, 10 * 60_000);

syncFixtures()
  .then(async () => {
    await reconcileActiveMatchStatuses();
    await reconcileRecentFinishedMatchScores();
  })
  .catch((error) => app.log.warn({ error }, "Initial TxLINE sync failed"));

await app.ready();

await app.listen({ port: serverEnv.port, host: "0.0.0.0" });

const shutdown = async () => {
  testGame.stop();
  txlineWorker.stop();
  await app.close();
};

process.once("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});

process.once("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});
