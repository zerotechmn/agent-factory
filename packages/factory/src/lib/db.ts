import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { config } from "./config";
import { claimDataDir } from "./db.lock";

// `bun test` started anywhere but packages/factory skips the test setup and
// would write test rows into the real database (it did: fake lessons reached
// real prompts). Fail loudly instead.
if (process.env.NODE_ENV === "test" && process.env.FACTORY_TEST_SETUP !== "1") {
  throw new Error("Tests must run with the factory test setup: `bun run test` from the repo root or `bun test` in packages/factory.");
}

mkdirSync(config.DATA_DIR, { recursive: true });

// Claimed before the database is opened: a second factory (Docker vs the Mac)
// must refuse before it touches the file, not after. See lib/db.guard.ts.
// Tests use a throwaway folder per process and claim folders explicitly.
if (process.env.FACTORY_TEST_SETUP !== "1") claimDataDir(config.DATA_DIR);

/** One connection shared by every feature's store; each store creates its own tables. */
export const db = new Database(join(config.DATA_DIR, "factory.sqlite"), { create: true });
db.exec("PRAGMA journal_mode = WAL;");
