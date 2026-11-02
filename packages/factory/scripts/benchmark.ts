/**
 * Scores the factory on a fixed set of prompts (benchmark/prompts.json), so a
 * change is judged by numbers across varied apps, not by one run.
 *
 *   bun packages/factory/scripts/benchmark.ts run <label>       # submits every prompt (real spend!) and waits
 *   bun packages/factory/scripts/benchmark.ts report <label> [baseline]
 *
 * Run from the repo root. `run` needs the stack up and BENCHMARK_TOKEN set
 * the same in .env (for the factory) and in this shell; it skips the per-IP
 * run limit but not the daily spend cap. Records and reports go to
 * data/benchmarks/.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { computeRunMetrics, loadRunData, summarize } from "../src/benchmark/benchmark.metrics";
import { renderBenchmark, type BenchmarkRecord } from "../src/benchmark/benchmark.report";

const API_URL = process.env.FACTORY_URL ?? "http://localhost";
const DATA_DIR = process.env.DATA_DIR ?? "./data";
const OUT_DIR = join(DATA_DIR, "benchmarks");
const TERMINAL = new Set(["deployed", "deployed_partial", "failed", "failed_budget"]);

const [command, label, baselineLabel] = process.argv.slice(2);
if (!label || !/^[\w.-]+$/.test(label) || (command !== "run" && command !== "report")) {
  console.error("Usage: benchmark.ts run <label> | report <label> [baseline]");
  process.exit(1);
}
await mkdir(OUT_DIR, { recursive: true });
if (command === "run") await run(label);
await report(label, baselineLabel);

async function run(name: string): Promise<void> {
  const recordPath = join(OUT_DIR, `${name}.json`);
  if (await Bun.file(recordPath).exists()) throw new Error(`${recordPath} exists; pick a new label`);
  const token = process.env.BENCHMARK_TOKEN;
  if (!token) throw new Error("Set BENCHMARK_TOKEN (the same value the factory has in .env)");
  const prompts = JSON.parse(await readFile(new URL("../benchmark/prompts.json", import.meta.url), "utf8")) as { designSystem: string; id: string; prompt: string }[];

  const record: BenchmarkRecord = { gitCommit: gitCommit(), label: name, runs: [], startedAt: new Date().toISOString() };
  for (const p of prompts) {
    const response = await fetch(`${API_URL}/api/runs`, {
      body: JSON.stringify({ designSystem: p.designSystem, prompt: p.prompt }),
      headers: { "content-type": "application/json", "x-benchmark-token": token },
      method: "POST",
    });
    const body = (await response.json()) as { data: { id: string } | null; message: string };
    if (!response.ok || !body.data) throw new Error(`${p.id}: ${body.message}`);
    record.runs.push({ promptId: p.id, runId: body.data.id });
    console.info("[benchmark] queued", { prompt: p.id, runId: body.data.id });
  }
  // Written before waiting, so an interrupted benchmark can still be reported.
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);

  for (;;) {
    const statuses = await Promise.all(
      record.runs.map(async (r) => ((await (await fetch(`${API_URL}/api/runs/${r.runId}`)).json()) as { data: { status: string } }).data.status),
    );
    const done = statuses.filter((s) => TERMINAL.has(s)).length;
    console.info(`[benchmark] ${done}/${record.runs.length} finished`);
    if (done === record.runs.length) return;
    await Bun.sleep(60_000);
  }
}

async function report(name: string, baseline?: string): Promise<void> {
  const record = JSON.parse(await readFile(join(OUT_DIR, `${name}.json`), "utf8")) as BenchmarkRecord;
  const metrics = await metricsOf(record);
  const summary = summarize(metrics);
  const base = baseline ? JSON.parse(await readFile(join(OUT_DIR, `${baseline}.json`), "utf8")) as BenchmarkRecord : null;
  const markdown = renderBenchmark({
    baseline: base ? { label: base.label, summary: summarize(await metricsOf(base)) } : null,
    metrics,
    record,
    summary,
  });
  const path = join(OUT_DIR, `${name}${baseline ? `-vs-${baseline}` : ""}.md`);
  await writeFile(path, markdown);
  console.info(markdown);
  console.info(`[benchmark] report written to ${path}`);
}

async function metricsOf(record: BenchmarkRecord) {
  const out = [];
  for (const r of record.runs) {
    const data = await loadRunData(DATA_DIR, r.runId);
    if (data) out.push({ ...computeRunMetrics(data), promptId: r.promptId });
  }
  return out;
}

function gitCommit(): string {
  return Bun.spawnSync(["git", "rev-parse", "HEAD"]).stdout.toString().trim() || "unknown";
}
