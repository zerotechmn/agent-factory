import { Elysia } from "elysia";

import { config } from "./lib/config";
import { indexLibrary } from "./librarian/librarian.ingest";
import { runsRoutes } from "./runs/runs.routes";
import { startWorker } from "./runs/runs.service";

const app = new Elysia()
  .get("/api/health", () => ({ ok: true }))
  .use(runsRoutes)
  .listen({ hostname: "0.0.0.0", port: config.PORT });

// Agents work without docs or catalog, so a broken index only costs search quality.
indexLibrary()
  .then((indexed) => console.info("[librarian] index ready", indexed))
  .catch((error: unknown) => console.error("[librarian] indexing failed", { message: error instanceof Error ? error.message : String(error) }));

startWorker();
console.info("[factory] listening", { port: app.server?.port });
