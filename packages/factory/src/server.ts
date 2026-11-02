import { Elysia } from "elysia";

import { config } from "./lib/config";
import { checkIntegrity, startSnapshots } from "./lib/db.guard";
import { indexLibrary } from "./librarian/librarian.ingest";
import { librarianRoutes } from "./librarian/librarian.routes";
import { runsRoutes } from "./runs/runs.routes";
import { startWorker } from "./runs/runs.service";

// The data folder lock is claimed in lib/db.ts, before the database opens.
const integrity = checkIntegrity();
if (!integrity.ok) {
  console.error("[db] INTEGRITY CHECK FAILED: the database is damaged. Stop the factory and restore data/backups/latest.sqlite (or an hourly copy).", {
    problems: integrity.problems.slice(0, 10),
  });
}
startSnapshots();

const app = new Elysia()
  .get("/api/health", () => ({ ok: true }))
  .use(runsRoutes)
  .use(librarianRoutes)
  .listen({ hostname: "0.0.0.0", port: config.PORT });

// Agents work without docs or catalog, so a broken index only costs search quality.
indexLibrary()
  .then((indexed) => console.info("[librarian] index ready", indexed))
  .catch((error: unknown) => console.error("[librarian] indexing failed", { message: error instanceof Error ? error.message : String(error) }));

startWorker();
console.info("[factory] listening", { port: app.server?.port });
