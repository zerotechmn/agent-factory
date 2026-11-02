import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Stores open SQLite at import time; tests get a throwaway folder instead of data/.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "factory-test-"));
process.env.ANTHROPIC_API_KEY ||= "sk-ant-test-not-a-real-key";
