import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { config } from "./config";

mkdirSync(config.DATA_DIR, { recursive: true });

/** One connection shared by every feature's store; each store creates its own tables. */
export const db = new Database(join(config.DATA_DIR, "factory.sqlite"), { create: true });
db.exec("PRAGMA journal_mode = WAL;");
