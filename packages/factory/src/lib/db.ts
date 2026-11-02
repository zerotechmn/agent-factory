import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { config } from "./config";

// `bun test` started anywhere but packages/factory skips the test setup and
// would write test rows into the real database (it did: fake lessons reached
// real prompts). Fail loudly instead.
if (process.env.NODE_ENV === "test" && process.env.FACTORY_TEST_SETUP !== "1") {
  throw new Error("Tests must run with the factory test setup: `bun run test` from the repo root or `bun test` in packages/factory.");
}

mkdirSync(config.DATA_DIR, { recursive: true });

/** One connection shared by every feature's store; each store creates its own tables. */
export const db = new Database(join(config.DATA_DIR, "factory.sqlite"), { create: true });
db.exec("PRAGMA journal_mode = WAL;");
