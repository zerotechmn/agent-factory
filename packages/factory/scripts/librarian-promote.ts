/**
 * Copies a module out of a green run's workspace into the librarian catalog
 * as a DRAFT. Drafts are not indexed: a person makes the code generic (no
 * product names or seed data), fills in the README, and removes the
 * "Status: draft" line before agents can find it.
 *
 *   bun packages/factory/scripts/librarian-promote.ts <runId> <item-name> <workspace path>…
 *
 * Paths keep their workspace layout under files/, e.g. web/src/theme.ts.
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

import { LIBRARY_DIR } from "../src/librarian/librarian.constants";

const DATA_DIR = process.env.DATA_DIR ?? join(LIBRARY_DIR, "../../../data");

async function main(): Promise<void> {
  const [runId, name, ...paths] = process.argv.slice(2);
  if (!runId || !name || paths.length === 0) throw new Error("usage: librarian-promote.ts <runId> <item-name> <workspace path>…");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error("item-name must be kebab-case");

  const runDir = join(DATA_DIR, "runs", runId);
  const run = JSON.parse(await readFile(join(runDir, "run.json"), "utf8")) as { status?: string };
  // Only code that passed every check is worth reusing; a partial deploy shipped with known issues.
  if (run.status !== "deployed") throw new Error(`run ${runId} is "${run.status}", only fully "deployed" runs can be promoted`);

  const itemDir = join(LIBRARY_DIR, "catalog", name);
  for (const path of paths) {
    const rel = normalize(path);
    if (rel.startsWith("..")) throw new Error(`${path} is outside the workspace`);
    const target = join(itemDir, "files", rel);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(runDir, "workspace", rel), target);
  }

  const readme = join(itemDir, "README.md");
  if (!existsSync(readme)) {
    await writeFile(
      readme,
      `# ${name}

TODO: one paragraph saying what this is and when to use it. Agents see this summary in catalog_search.

Tags: TODO, e.g. antd, react, express

Status: draft

## Contract

TODO: what the code expects (props, env, API shape) and what to change when adapting it.

## Origin

Promoted from run \`${runId}\`: ${paths.map((p) => `\`${p}\``).join(", ")}. Remove product-specific names, routes and data before publishing.
`,
    );
  }
  console.info("[librarian-promote] draft written", { files: paths.length, item: itemDir });
}

await main();
