import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Acceptance } from "../agents/acceptance/acceptance.schema";
import { parseTestCounts, parseTestLog } from "../board/board.utils";
import { callDeployer } from "../lib/deployer";
import { commitWorkspace, gitOutput, headCommit, type RunPaths } from "./pipeline.artifacts";

export const ACCEPTANCE_DIR = "acceptance";

const HARNESS = fileURLToPath(new URL("../../acceptance-harness/harness.mjs", import.meta.url));

// Only flat test files inside acceptance/: the agent's paths never reach anywhere else.
const FILE_PATH = /^acceptance\/[\w.-]+\.test\.mjs$/;

/**
 * Writes the tester's files to a scratch folder and checks each with
 * `node --check`. Returns one problem per bad path or file; empty means the
 * suite is ready to install.
 */
export async function checkAcceptanceFiles(handoff: Acceptance, scratchDir: string): Promise<string[]> {
  const issues: string[] = [];
  for (const file of handoff.files) {
    if (!FILE_PATH.test(file.path)) {
      issues.push(`${file.path}: path must be acceptance/<name>.test.mjs`);
      continue;
    }
    const target = join(scratchDir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content);
    const check = Bun.spawnSync(["node", "--check", target], { stderr: "pipe" });
    if (check.exitCode !== 0) issues.push(`${file.path}: ${check.stderr.toString().trim().split("\n").slice(0, 6).join(" | ")}`);
  }
  return issues;
}

/**
 * Puts the suite into the workspace (harness, its auth config and the test
 * files), commits it and returns the commit that later stages are checked
 * against. Files with a bad path are skipped, never written.
 */
export async function installAcceptance(paths: RunPaths, handoff: Acceptance): Promise<string | null> {
  const dir = join(paths.workspace, ACCEPTANCE_DIR);
  await mkdir(dir, { recursive: true });
  await copyFile(HARNESS, join(dir, "harness.mjs"));
  await writeFile(join(dir, "harness.config.json"), `${JSON.stringify({ auth: handoff.auth }, null, 2)}\n`);
  for (const file of handoff.files.filter((f) => FILE_PATH.test(f.path))) await writeFile(join(paths.workspace, file.path), file.content);
  await commitWorkspace(paths, "acceptance tests (independent tester)");
  return headCommit(paths);
}

/**
 * The developer may read the acceptance suite but never change it. Anything
 * changed, added or deleted under acceptance/ since `commit` is put back and
 * committed. Returns the paths that had to be restored.
 */
export async function protectAcceptance(paths: RunPaths, commit: string): Promise<string[]> {
  const changed = (await gitOutput(paths, ["diff", "--name-status", commit, "HEAD", "--", ACCEPTANCE_DIR]))
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t") as [string, string]);
  if (!changed.length) return [];
  for (const [status, path] of changed) {
    if (status === "A") await rm(join(paths.workspace, path), { force: true });
  }
  await gitOutput(paths, ["checkout", commit, "--", ACCEPTANCE_DIR]);
  await commitWorkspace(paths, "restore acceptance tests changed outside the tester");
  return changed.map(([, path]) => path);
}

export type AcceptanceResult = {
  exitCode: number | null;
  failed: number;
  /** Factory-level gate outcome: every acceptance test passed. */
  ok: boolean;
  passed: number;
  /** Result per test case id (canonical "TC-n"), from the TAP lines. */
  perCase: Record<string, "failed" | "passed">;
  /** Why the suite didn't run, or null when it ran. */
  skipped: string | null;
  timedOut: boolean;
};

const TIMEOUT_MS = 5 * 60_000;

/**
 * Runs the independent tester's black-box suite (workspace/acceptance) against
 * a throwaway copy of the app: same image, not routed, fresh /data. The live
 * container is never touched, so test data can't leak into the app people use.
 */
export async function runAcceptance({
  appPort,
  logPath,
  onStep = () => {},
  runId,
  workspace,
}: {
  appPort: number;
  logPath: string;
  onStep?: (text: string) => void;
  runId: string;
  workspace: string;
}): Promise<AcceptanceResult> {
  const empty = { exitCode: null, failed: 0, ok: true, passed: 0, perCase: {}, timedOut: false };
  if (!existsSync(join(workspace, "acceptance", "harness.mjs"))) return { ...empty, skipped: "No acceptance tests in this run" };

  onStep("Starting a throwaway copy of the app for the acceptance tests");
  const started = await callDeployer("/run", { instance: "acceptance", port: appPort, runId });
  if (!started.ok || !parse<{ ok?: boolean }>(started.body)?.ok) {
    await writeFile(logPath, `Could not start the acceptance instance:\n${started.body}\n`);
    return { ...empty, ok: false, skipped: "The acceptance copy of the app did not start" };
  }

  try {
    const health = await callDeployer("/check", { instance: "acceptance", path: "/health", runId });
    if (parse<{ status?: number }>(health.body)?.status !== 200) {
      await writeFile(logPath, `The acceptance instance never answered /health:\n${health.body}\n`);
      return { ...empty, ok: false, skipped: "The acceptance copy of the app never became healthy" };
    }

    onStep("Running the independent acceptance tests");
    const { ANTHROPIC_API_KEY: _key, ...env } = process.env;
    const proc = Bun.spawn(["node", "--test", "--test-reporter=tap", "--test-concurrency=1", "acceptance/**/*.test.mjs"], {
      cwd: workspace,
      env: {
        ...env,
        BASE_URL: `http://factory-app-${runId}-acc:${appPort}`,
        // Tests import Playwright through the harness; it lives in the factory, not the app.
        PLAYWRIGHT_MODULE: import.meta.resolve("playwright"),
      },
      stderr: "pipe",
      stdin: "ignore",
      stdout: "pipe",
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, TIMEOUT_MS);
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    clearTimeout(timer);
    const log = `${stdout}${stderr ? `\n--- stderr ---\n${stderr}` : ""}`;
    await writeFile(logPath, log);

    const perCase = Object.fromEntries(parseTestLog(stdout));
    const counts = parseTestCounts(stdout) ?? { failed: Object.values(perCase).filter((r) => r === "failed").length, passed: 0 };
    const result = { exitCode: timedOut ? null : exitCode, failed: counts.failed, passed: counts.passed, perCase, skipped: null, timedOut };
    onStep(`Acceptance tests: ${counts.passed} passing${counts.failed ? `, ${counts.failed} failing` : ""}`);
    return { ...result, ok: !timedOut && exitCode === 0 };
  } finally {
    await callDeployer("/remove", { instance: "acceptance", runId });
  }
}

function parse<T>(body: string): T | null {
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}
