import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { LedgerEntry, StageKey } from "./pipeline.types";

/**
 * Run directory layout. Human-readable output (REPORT.md, SUMMARY.md) is kept
 * apart from machine handoffs (handoff.json) so the next agent never reads
 * prose written for people, and people never have to read raw JSON.
 */
export type RunPaths = {
  ledger: string;
  prompt: string;
  root: string;
  runJson: string;
  stages: string;
  summary: string;
  workspace: string;
};

export function runPaths(dataDir: string, runId: string): RunPaths {
  const root = join(dataDir, "runs", runId);
  return {
    ledger: join(root, "ledger.jsonl"),
    prompt: join(root, "prompt.md"),
    root,
    runJson: join(root, "run.json"),
    stages: join(root, "stages"),
    summary: join(root, "SUMMARY.md"),
    workspace: join(root, "workspace"),
  };
}

export type StagePaths = {
  dir: string;
  dirName: string;
  handoff: string;
  meta: string;
  report: string;
  transcript: string;
};

export function stagePaths(paths: RunPaths, seq: number, stageKey: StageKey, suffix?: string): StagePaths {
  // Sequence-numbered so the folder listing reads chronologically, fix loops included.
  const dirName = `${String(seq).padStart(2, "0")}-${toKebab(stageKey)}${suffix ? `-${suffix}` : ""}`;
  const dir = join(paths.stages, dirName);
  return {
    dir,
    dirName,
    handoff: join(dir, "handoff.json"),
    meta: join(dir, "meta.json"),
    report: join(dir, "REPORT.md"),
    transcript: join(dir, "transcript.jsonl"),
  };
}

export async function initRunDir(paths: RunPaths, prompt: string): Promise<void> {
  await mkdir(paths.stages, { recursive: true });
  await mkdir(paths.workspace, { recursive: true });
  await writeFile(paths.prompt, `# User prompt\n\n${prompt}\n`);
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function appendJsonl(path: string, value: unknown): Promise<void> {
  await appendFile(path, `${JSON.stringify(value)}\n`);
}

export async function appendLedger(paths: RunPaths, entry: LedgerEntry): Promise<void> {
  await appendJsonl(paths.ledger, entry);
}

export async function readStageReport(paths: RunPaths, dirName: string): Promise<string | null> {
  // dirName comes from the API; only accept names we generate to block path traversal.
  if (!/^\d{2}-[a-z-]+(-[a-z0-9-]+)?$/.test(dirName)) return null;
  try {
    return await readFile(join(paths.stages, dirName, "REPORT.md"), "utf8");
  } catch {
    return null;
  }
}

export async function listStageDirs(paths: RunPaths): Promise<string[]> {
  try {
    return (await readdir(paths.stages)).sort();
  } catch {
    return [];
  }
}

export async function workspaceHasFile(paths: RunPaths, file: string): Promise<boolean> {
  return Bun.file(join(paths.workspace, file)).exists();
}

/** Commits the workspace so `git log -p` shows exactly what each agent changed. */
export async function commitWorkspace(paths: RunPaths, message: string): Promise<void> {
  const git = (...args: string[]) =>
    Bun.spawn(["git", ...args], {
      cwd: paths.workspace,
      env: {
        ...process.env,
        GIT_AUTHOR_EMAIL: "factory@localhost",
        GIT_AUTHOR_NAME: "factory",
        GIT_COMMITTER_EMAIL: "factory@localhost",
        GIT_COMMITTER_NAME: "factory",
      },
      stderr: "ignore",
      stdout: "ignore",
    }).exited;

  if (!(await Bun.file(join(paths.workspace, ".git", "HEAD")).exists())) {
    await git("init", "-q");
  }
  await git("add", "-A");
  await git("commit", "-q", "--allow-empty", "-m", message);
}

/** Runs git in the workspace and returns its stdout (empty on failure). */
export async function gitOutput(paths: RunPaths, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd: paths.workspace, stderr: "ignore", stdout: "pipe" });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return code === 0 ? out : "";
}

/**
 * Drops what an interrupted step left half-written, back to the last commit
 * (every finished step commits). Ignored files such as node_modules stay, so
 * the rerun doesn't reinstall everything. A workspace without commits is left alone.
 */
export async function resetWorkspace(paths: RunPaths): Promise<void> {
  if (!(await Bun.file(join(paths.workspace, ".git", "HEAD")).exists())) return;
  const git = (...args: string[]) => Bun.spawn(["git", ...args], { cwd: paths.workspace, stderr: "ignore", stdout: "ignore" }).exited;
  if (!(await headCommit(paths))) return;
  await git("reset", "--hard", "-q", "HEAD");
  await git("clean", "-fdq");
}

/** Current workspace commit, so a re-review can diff exactly what changed since the last review. */
export async function headCommit(paths: RunPaths): Promise<string | null> {
  const proc = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: paths.workspace, stderr: "ignore", stdout: "pipe" });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return code === 0 ? out.trim() : null;
}

function toKebab(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}
