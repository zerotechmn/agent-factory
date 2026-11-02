import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { commitWorkspace, runPaths } from "../../pipeline/pipeline.artifacts";
import { checkAcceptanceFiles, installAcceptance, protectAcceptance, runAcceptance } from "../../pipeline/pipeline.acceptance";
import { agentFor } from "../agents.registry";
import { renderAcceptance } from "./acceptance.report";
import { acceptanceSchema, type Acceptance } from "./acceptance.schema";

const suite: Acceptance = {
  auth: { header: { name: "X-Role", value: "{role}" }, kind: "header", login: null },
  coverage: [
    { file: "acceptance/bookings.test.mjs", kind: "api", reason: "", testCaseId: "TC-1" },
    { file: "", kind: "skipped", reason: "needs email delivery", testCaseId: "TC-2" },
  ],
  files: [
    {
      content: `import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { api } from "./harness.mjs";\n\ntest("TC-1: lists bookings", async () => {\n  assert.equal((await api("GET", "/api/bookings")).status, 200);\n});\n`,
      path: "acceptance/bookings.test.mjs",
    },
  ],
};

async function workspace() {
  const paths = runPaths(await mkdtemp(join(tmpdir(), "acc-")), "acctest001");
  await Bun.write(join(paths.workspace, "src/app.js"), "export {};\n");
  await commitWorkspace(paths, "app");
  return paths;
}

describe("acceptance tester output", () => {
  test("the example satisfies the schema and renders coverage", () => {
    expect(acceptanceSchema.safeParse(suite).success).toBe(true);
    const md = renderAcceptance(suite);
    expect(md).toContain("1 API, 0 browser, 1 skipped, of 2 test cases");
    expect(md).toContain("| TC-2 | skipped | — | needs email delivery |");
    expect(agentFor("acceptance", "zt").runtime).toBe("doc");
  });

  test("a repair resumes with only the problems; a fresh fallback also gets the full brief", () => {
    const ctx = { handoffs: {}, repairIssues: ["acceptance/a.test.mjs: SyntaxError"] } as never;
    const resumed = agentFor("acceptance", "zt").buildPrompt({ ...(ctx as object), resumed: true } as never);
    const fresh = agentFor("acceptance", "zt").buildPrompt({ ...(ctx as object), resumed: false } as never);
    expect(resumed).toContain("don't parse");
    expect(resumed).not.toContain("## Rules");
    expect(fresh).toContain("## Rules");
    expect(fresh).toContain("don't parse");
  });
});

describe("acceptance files", () => {
  test("node --check catches syntax errors and paths outside acceptance/", async () => {
    const bad: Acceptance = {
      ...suite,
      files: [
        ...suite.files,
        { content: "test('TC-3: broken', async () => {", path: "acceptance/broken.test.mjs" },
        { content: "export {};", path: "../escape.test.mjs" },
      ],
    };
    const issues = await checkAcceptanceFiles(bad, await mkdtemp(join(tmpdir(), "acc-check-")));
    expect(issues.map((i) => i.split(":")[0])).toEqual(["acceptance/broken.test.mjs", "../escape.test.mjs"]);
  });

  test("install writes the harness, auth config and files, and commits them", async () => {
    const paths = await workspace();
    const commit = await installAcceptance(paths, suite);
    expect(commit).toMatch(/^[0-9a-f]{40}$/);
    expect(await Bun.file(join(paths.workspace, "acceptance/harness.mjs")).exists()).toBe(true);
    expect(JSON.parse(await readFile(join(paths.workspace, "acceptance/harness.config.json"), "utf8")).auth.kind).toBe("header");
    expect(await readFile(join(paths.workspace, "acceptance/bookings.test.mjs"), "utf8")).toContain("TC-1");
  });

  test("changes by another agent are put back: edited, added and deleted files", async () => {
    const paths = await workspace();
    const commit = (await installAcceptance(paths, suite))!;
    expect(await protectAcceptance(paths, commit)).toEqual([]);

    const file = join(paths.workspace, "acceptance/bookings.test.mjs");
    const original = await readFile(file, "utf8");
    await writeFile(file, "// weakened\n");
    await writeFile(join(paths.workspace, "acceptance/extra.test.mjs"), "export {};\n");
    await rm(join(paths.workspace, "acceptance/harness.config.json"));
    await commitWorkspace(paths, "developer fix");

    const restored = await protectAcceptance(paths, commit);
    expect(restored.sort()).toEqual(["acceptance/bookings.test.mjs", "acceptance/extra.test.mjs", "acceptance/harness.config.json"]);
    expect(await readFile(file, "utf8")).toBe(original);
    expect(await Bun.file(join(paths.workspace, "acceptance/extra.test.mjs")).exists()).toBe(false);
    expect(await Bun.file(join(paths.workspace, "acceptance/harness.config.json")).exists()).toBe(true);
    expect(await protectAcceptance(paths, commit)).toEqual([]);
  });

  test("verify skips the step cleanly when a run has no suite", async () => {
    const paths = await workspace();
    const result = await runAcceptance({ appPort: 8080, logPath: join(paths.root, "acceptance.log"), runId: "acctest001", workspace: paths.workspace });
    expect(result).toMatchObject({ ok: true, skipped: "No acceptance tests in this run" });
  });
});
