import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// config.ts validates the environment at import time, so set it before the
// dynamic imports below. Nothing listens on this deployer port, which is the
// point: the container half of the gate must fail cleanly, not throw.
process.env.ANTHROPIC_API_KEY ??= "test-key";
process.env.DEPLOYER_URL = "http://127.0.0.1:9";

const { initRunDir, runPaths, stagePaths } = await import("./pipeline.artifacts");
const { runGate } = await import("./pipeline.gate");

let dataDir = "";

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "factory-gate-"));
  process.env.DATA_DIR = dataDir;
});

afterAll(async () => {
  await rm(dataDir, { force: true, recursive: true });
});

async function gateWith(runId: string, commands: { install: string; test: string } | null) {
  const paths = runPaths(dataDir, runId);
  await initRunDir(paths, "fixture");
  const sp = stagePaths(paths, 1, "verify");
  const result = await runGate({ appPort: 8080, commands, mode: "full", paths, runId, smokeChecks: [], stagePaths: sp, uiCheckMobile: true, uiScreens: [] });
  return { result, sp };
}

describe("runGate", () => {
  test("passing tests are recorded, and an unreachable deployer fails at build without throwing", async () => {
    const { result, sp } = await gateWith("gatepass01", { install: "echo installing", test: "echo all-green" });
    expect(result.tests).toMatchObject({ exitCode: 0, ok: true, timedOut: false });
    expect(result.failedSteps).toEqual(["build"]);
    expect(result.containerOk).toBe(false);
    expect(result.passed).toBe(false);
    expect(await readFile(join(sp.dir, "tests.log"), "utf8")).toContain("all-green");
    expect(JSON.parse(await readFile(sp.handoff, "utf8")).failedSteps).toEqual(["build"]);
    expect(await readFile(sp.report, "utf8")).toContain("# Verify — failed");
  });

  test("a failing test command is reported with its exit code and log", async () => {
    const { result } = await gateWith("gatefail01", { install: "true", test: "echo 'expected 2 got 3' && exit 3" });
    expect(result.tests).toMatchObject({ exitCode: 3, ok: false });
    expect(result.failedSteps).toContain("tests");
    expect(result.logs.tests).toContain("expected 2 got 3");
  });

  test("install failure short-circuits the test command", async () => {
    const { result } = await gateWith("gatefail02", { install: "exit 7", test: "echo should-not-run" });
    expect(result.tests?.exitCode).toBe(7);
    expect(result.logs.tests ?? "").not.toContain("should-not-run");
  });

  test("agent-written commands with quotes and $ are passed through without shell-quoting bugs", async () => {
    const { result } = await gateWith("gatequote1", { install: "true", test: `X='a "b" $c'; [ "$X" = 'a "b" $c' ]` });
    expect(result.tests?.ok).toBe(true);
  });

  test("the API key is not visible to generated code", async () => {
    const { result } = await gateWith("gatekey001", { install: "true", test: '[ -z "$ANTHROPIC_API_KEY" ]' });
    expect(result.tests?.ok).toBe(true);
  });

  test("a missing test command fails the tests step", async () => {
    const { result } = await gateWith("gatenone01", null);
    expect(result.tests).toMatchObject({ exitCode: null, ok: false });
    expect(result.failedSteps).toContain("tests");
  });
});
