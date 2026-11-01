import { Elysia } from "elysia";

import { config } from "./lib/config";
import { runsRoutes } from "./runs/runs.routes";
import { startWorker } from "./runs/runs.service";

const app = new Elysia()
  .get("/api/health", () => ({ ok: true }))
  .use(runsRoutes)
  .listen({ hostname: "0.0.0.0", port: config.PORT });

startWorker();
console.info("[factory] listening", { port: app.server?.port });
