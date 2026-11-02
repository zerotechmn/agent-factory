import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { callDeployer } from "../lib/deployer";
import { writeJson, type RunPaths, type StagePaths } from "./pipeline.artifacts";
import { VERIFY_TESTS_TIMEOUT_MS } from "./pipeline.constants";
import { runAcceptance, type AcceptanceResult } from "./pipeline.acceptance";
import { runUiCheck, summarizeUiFailures, type UiCheckResult, type UiScreen } from "./pipeline.ui-check";

export type GateStep = "tests" | "build" | "run" | "health" | "smoke" | "ui" | "acceptance";

export type SmokeCheck = { description: string; expectStatus: number; id: string; method: string; path: string };

export type SmokeResult = { actualStatus: number | null; expectStatus: number; id: string; ok: boolean; path: string };

export type GateResult = {
  /** The independent tester's black-box suite; null when not run (container-only re-check, or no container). */
  acceptance: (AcceptanceResult & { mode: "advisory" | "blocking" }) | null;
  /** Image built, container running and /health returned 200. */
  containerOk: boolean;
  failedSteps: GateStep[];
  /** Last lines of the failing step's output, for whichever agent repairs it. */
  logs: Partial<Record<GateStep, string>>;
  mode: GateMode;
  passed: boolean;
  smoke: SmokeResult[];
  tests: { command: string; exitCode: number | null; ok: boolean; timedOut: boolean } | null;
  /** Browser checks of every screen; null when the container never came up. */
  ui: UiCheckResult | null;
};

/** "container" skips the test suite: used to redeploy after a change when tests already ran. */
export type GateMode = "full" | "container";

type Commands = { install: string; test: string };

const LOG_EXCERPT_CHARS = 6_000;

/**
 * The verify gate: everything that used to cost an LLM call but is really a
 * yes/no fact — do the tests pass, does the image build, does the container
 * answer /health and the smoke checks. It is free, deterministic and leaves a
 * normal stage folder (REPORT.md, handoff.json, logs) like any agent. A green
 * gate also *is* the deployment: the container it starts is the live app.
 */
export async function runGate({
  appPort,
  commands,
  mode,
  onStep = () => {},
  paths,
  runId,
  acceptanceMode = "advisory",
  smokeChecks,
  stagePaths,
  uiBaseUrl,
  uiCheckMobile,
  uiScreens,
}: {
  appPort: number;
  commands: Commands | null;
  mode: GateMode;
  /** Plain-language progress for the live activity feed. */
  onStep?: (text: string) => void;
  paths: RunPaths;
  runId: string;
  /** advisory: reported only; blocking: a failure fails verify. */
  acceptanceMode?: "advisory" | "blocking";
  smokeChecks: SmokeCheck[];
  stagePaths: StagePaths;
  /** Where the browser reaches the app; defaults to the container on the shared Docker network. */
  uiBaseUrl?: string;
  uiCheckMobile: boolean;
  uiScreens: UiScreen[];
}): Promise<GateResult> {
  await mkdir(stagePaths.dir, { recursive: true });
  const logs: GateResult["logs"] = {};
  const failedSteps: GateStep[] = [];

  // Tests and container are checked independently: a repair agent needs to
  // know about every broken part, not just the first one.
  let tests: GateResult["tests"] = null;
  if (mode === "full") {
    onStep("Installing dependencies and running the test suite");
    tests = await runTests({ commands, logPath: join(stagePaths.dir, "tests.log"), workspace: paths.workspace });
    if (!tests.ok) {
      failedSteps.push("tests");
      logs.tests = excerpt(await readFile(join(stagePaths.dir, "tests.log"), "utf8").catch(() => ""));
    }
  }

  if (tests) onStep(tests.ok ? "Test suite passed" : "Test suite failed");
  onStep("Building the app image and starting it");
  const container = await deployContainer({ appPort, runId, stageDir: stagePaths.dir });
  if (container.failedStep) {
    failedSteps.push(container.failedStep);
    logs[container.failedStep] = container.log;
  }

  const smoke: SmokeResult[] = [];
  onStep(container.ok ? "App is up and answering /health" : `App container failed at: ${container.failedStep}`);
  if (container.ok) {
    // Only GETs are checkable without request bodies; other methods are covered by the test suite.
    for (const check of smokeChecks.filter((c) => c.method === "GET")) {
      const status = await httpStatus(runId, check.path);
      smoke.push({ actualStatus: status, expectStatus: check.expectStatus, id: check.id, ok: status === check.expectStatus, path: check.path });
    }
    if (smoke.some((s) => !s.ok)) {
      failedSteps.push("smoke");
      logs.smoke = (await callDeployer("/logs", { runId })).body.slice(-LOG_EXCERPT_CHARS);
    }
  }

  // HTTP checks can't see layout. The browser pass catches what a person
  // would see as broken, which the tests and the code review both missed in
  // run gt29eh7rws (header words split mid-letter on every screen).
  let ui: UiCheckResult | null = null;
  if (container.ok) {
    onStep(`Opening ${uiScreens.length} screens in a browser`);
    ui = await runUiCheck({
      baseUrl: uiBaseUrl ?? `http://factory-app-${runId}:${appPort}`,
      checkMobile: uiCheckMobile,
      outDir: stagePaths.dir,
      screens: uiScreens,
    });
    if (ui.pages.some((p) => p.failures.length)) {
      failedSteps.push("ui");
      logs.ui = excerpt(summarizeUiFailures(ui));
    }
  }

  // Last: the slowest step, and a separate container, so a broken app above is reported first.
  let acceptance: GateResult["acceptance"] = null;
  if (container.ok && mode === "full") {
    const ran = await runAcceptance({ appPort, logPath: join(stagePaths.dir, "acceptance.log"), onStep, runId, workspace: paths.workspace });
    if (!ran.skipped || !ran.ok) acceptance = { ...ran, mode: acceptanceMode };
    if (acceptance && !acceptance.ok && acceptanceMode === "blocking") {
      failedSteps.push("acceptance");
      logs.acceptance = excerpt(await readFile(join(stagePaths.dir, "acceptance.log"), "utf8").catch(() => ""));
    }
  }

  const result: GateResult = {
    acceptance,
    containerOk: container.ok,
    failedSteps,
    logs,
    mode,
    passed: failedSteps.length === 0,
    smoke,
    tests,
    ui,
  };
  await writeJson(stagePaths.handoff, result);
  await writeFile(stagePaths.report, renderReport(result));
  console.info("[gate] done", { failedSteps, mode, runId });
  return result;
}

async function runTests({
  commands,
  logPath,
  workspace,
}: {
  commands: Commands | null;
  logPath: string;
  workspace: string;
}): Promise<NonNullable<GateResult["tests"]>> {
  if (!commands?.test) {
    await writeFile(logPath, "The developer handoff has no test command.\n");
    return { command: "", exitCode: null, ok: false, timedOut: false };
  }
  const command = `${commands.install || "true"} && ${commands.test}`;

  // Commands go in through env vars and `eval`, so no shell quoting of
  // agent-written strings is needed. The API key is removed: generated code
  // has no business reading it.
  const { ANTHROPIC_API_KEY: _key, ...env } = process.env;
  const proc = Bun.spawn(["bash", "-c", 'exec >"$GATE_LOG" 2>&1; eval "$GATE_INSTALL" && eval "$GATE_TEST"'], {
    cwd: workspace,
    env: { ...env, CI: "1", GATE_INSTALL: commands.install || "true", GATE_LOG: logPath, GATE_TEST: commands.test },
    stdin: "ignore",
  });

  let timedOut = false;
  // Killing bash may leave a server the tests started; the next gate's
  // container check is unaffected because it runs in a separate container.
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGKILL");
  }, VERIFY_TESTS_TIMEOUT_MS);
  const exitCode = await proc.exited;
  clearTimeout(timer);

  return { command, exitCode: timedOut ? null : exitCode, ok: !timedOut && exitCode === 0, timedOut };
}

async function deployContainer({
  appPort,
  runId,
  stageDir,
}: {
  appPort: number;
  runId: string;
  stageDir: string;
}): Promise<{ failedStep: GateStep | null; log: string; ok: boolean }> {
  const build = await callDeployer("/build", { runId });
  await writeFile(join(stageDir, "build.log"), deployerOutput(build.body));
  if (!build.ok || !parse<{ ok?: boolean }>(build.body)?.ok) {
    return { failedStep: "build", log: excerpt(deployerOutput(build.body)), ok: false };
  }

  const run = await callDeployer("/run", { port: appPort, runId });
  if (!run.ok || !parse<{ ok?: boolean }>(run.body)?.ok) {
    const logs = await callDeployer("/logs", { runId });
    await writeFile(join(stageDir, "container.log"), deployerOutput(logs.body));
    return { failedStep: "run", log: excerpt(`${run.body}\n${deployerOutput(logs.body)}`), ok: false };
  }

  const health = await httpStatus(runId, "/health");
  if (health !== 200) {
    const logs = await callDeployer("/logs", { runId });
    await writeFile(join(stageDir, "container.log"), deployerOutput(logs.body));
    return {
      failedStep: "health",
      log: excerpt(`GET /health returned ${health ?? "no response"}.\n${deployerOutput(logs.body)}`),
      ok: false,
    };
  }
  return { failedStep: null, log: "", ok: true };
}

async function httpStatus(runId: string, path: string): Promise<number | null> {
  const result = await callDeployer("/check", { path, runId });
  return result.ok ? (parse<{ status?: number | null }>(result.body)?.status ?? null) : null;
}

function deployerOutput(body: string): string {
  return parse<{ output?: string }>(body)?.output ?? body;
}

function parse<T>(body: string): T | null {
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

function excerpt(text: string): string {
  // The end of a log is where the failure is.
  return text.length > LOG_EXCERPT_CHARS ? `…${text.slice(-LOG_EXCERPT_CHARS)}` : text;
}

const STEP_LABELS: Record<GateStep, string> = {
  build: "Docker image build",
  health: "GET /health",
  run: "Container start",
  smoke: "Smoke checks",
  acceptance: "Acceptance tests (independent)",
  tests: "Install + test suite",
  ui: "Browser checks",
};

function acceptanceState(a: GateResult["acceptance"]): string {
  if (!a) return "– not run";
  if (a.skipped) return `✕ ${a.skipped}${a.mode === "advisory" ? " (advisory)" : ""}`;
  const counts = `${a.passed} passed, ${a.failed} failed${a.timedOut ? ", timed out" : ""}`;
  if (a.ok) return `✓ passed (${counts})`;
  return a.mode === "advisory" ? `⚠ ${counts} — advisory, does not fail verify` : `✕ failed (${counts})`;
}

function renderReport(result: GateResult): string {
  const row = (step: GateStep, state: string) => `| ${STEP_LABELS[step]} | ${state} |`;
  const stepState = (step: GateStep) => (result.failedSteps.includes(step) ? "✕ failed" : "✓ passed");
  const containerSteps: GateStep[] = ["build", "run", "health"];
  // A container step after the failing one never ran.
  const firstContainerFailure = containerSteps.findIndex((s) => result.failedSteps.includes(s));
  const rows = [
    result.tests
      ? row("tests", result.tests.timedOut ? "✕ timed out" : stepState("tests"))
      : row("tests", "– skipped (container-only re-check)"),
    ...containerSteps.map((step, i) =>
      row(step, firstContainerFailure !== -1 && i > firstContainerFailure ? "– not reached" : stepState(step)),
    ),
    row("smoke", result.containerOk ? `${stepState("smoke")} (${result.smoke.filter((s) => s.ok).length}/${result.smoke.length} GET checks)` : "– not reached"),
    row(
      "ui",
      !result.ui
        ? "– not reached"
        : result.ui.skipped
          ? `– skipped: ${result.ui.skipped}`
          : `${stepState("ui")} (${result.ui.pages.filter((p) => !p.failures.length).length}/${result.ui.pages.length} screen × viewport checks clean)`,
    ),
    row("acceptance", acceptanceState(result.acceptance)),
  ];
  const smokeTable = result.smoke.length
    ? `\n\n## Smoke checks\n\n| Check | Path | Expected | Actual |\n|---|---|---|---|\n${result.smoke
        .map((s) => `| ${s.id} | \`${s.path}\` | ${s.expectStatus} | ${s.actualStatus ?? "no response"}${s.ok ? "" : " ✕"} |`)
        .join("\n")}`
    : "";
  const failures = (Object.entries(result.logs) as [GateStep, string][])
    .map(([step, log]) => `### ${STEP_LABELS[step]}\n\n\`\`\`\n${log.trim()}\n\`\`\``)
    .join("\n\n");
  const uiTable = result.ui?.pages.length
    ? `\n\n## Browser checks\n\n| Screen | Path | Viewport | Failures | Warnings | Screenshot |\n|---|---|---|---|---|---|\n${result.ui.pages
        .map(
          (p) =>
            `| ${p.screenId} | \`${p.path}\` | ${p.viewport} | ${p.failures.length ? p.failures.map((f) => `${f.kind}: ${f.detail}`.replace(/\|/g, "\\|")).join("<br>") : "✓"} | ${p.warnings.length} | ${p.screenshot ? `\`${p.screenshot}\`` : "—"} |`,
        )
        .join("\n")}`
    : "";
  // Name only the log files this run actually wrote.
  const logFiles = [
    result.tests ? "`tests.log`" : null,
    "`build.log`",
    result.failedSteps.some((s) => s === "run" || s === "health") ? "`container.log`" : null,
    result.acceptance ? "`acceptance.log`" : null,
  ].filter(Boolean);

  return `# Verify — ${result.passed ? "passed" : "failed"}

Automated checks run by the factory itself (no LLM, no cost).${result.tests?.command ? ` Test command: \`${result.tests.command}\`.` : ""}

| Step | Result |
|---|---|
${rows.join("\n")}${smokeTable}${uiTable}
${failures ? `\n## Failure output\n\n${failures}\n` : ""}
Full logs in this folder: ${logFiles.join(", ")}.
`;
}
