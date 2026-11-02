import type { BenchmarkSummary, RunMetrics } from "./benchmark.metrics";

export type BenchmarkRecord = {
  gitCommit: string;
  label: string;
  runs: { promptId: string; runId: string }[];
  startedAt: string;
};

/** The benchmark's Markdown report, with deltas against a baseline when one is given. */
export function renderBenchmark({
  baseline,
  metrics,
  record,
  summary,
}: {
  baseline?: { label: string; summary: BenchmarkSummary } | null;
  metrics: (RunMetrics & { promptId: string })[];
  record: BenchmarkRecord;
  summary: BenchmarkSummary;
}): string {
  const out: string[] = [];
  out.push(`# Benchmark ${record.label}`, "", `Commit \`${record.gitCommit.slice(0, 8)}\` · started ${record.startedAt} · ${summary.runs} runs`, "");

  const rows: [string, (s: BenchmarkSummary) => number | null, (v: number) => string, "lower" | "higher"][] = [
    ["Deployed", (s) => s.deployed, (v) => `${v} / ${summary.runs}`, "higher"],
    ["Acceptance pass rate (independent)", (s) => s.acceptancePassRate, pct, "higher"],
    ["Verify passed first time", (s) => s.firstVerifyPassRate, pct, "higher"],
    ["Fix rounds (total)", (s) => s.totalFixRounds, (v) => String(v), "lower"],
    ["Mean cost", (s) => s.meanCostUsd, usd, "lower"],
    ["Total cost", (s) => s.totalCostUsd, usd, "lower"],
    ["Mean run time", (s) => s.meanMinutes, (v) => `${v} min`, "lower"],
    ["Mean development time", (s) => s.meanDevMinutes, (v) => `${v} min`, "lower"],
  ];
  out.push(baseline ? `| Metric | ${record.label} | ${baseline.label} | Change |` : `| Metric | ${record.label} |`);
  out.push(baseline ? "| --- | --- | --- | --- |" : "| --- | --- |");
  for (const [name, pick, fmt, better] of rows) {
    const now = pick(summary);
    const shown = now === null ? "—" : fmt(now);
    if (!baseline) {
      out.push(`| ${name} | ${shown} |`);
      continue;
    }
    const before = pick(baseline.summary);
    out.push(`| ${name} | ${shown} | ${before === null ? "—" : fmt(before)} | ${delta(now, before, better)} |`);
  }

  out.push("", "## Runs", "", "| Prompt | Run | Status | Cost | Time | Dev | Fixes | Verify 1st | Acceptance | Coverage | Review B/M |");
  out.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const m of metrics) {
    const acceptance = !m.acceptance ? "—" : m.acceptance.skipped ? `skipped: ${m.acceptance.skipped}` : `${m.acceptance.passed}/${m.acceptance.passed + m.acceptance.failed}`;
    const coverage = m.acceptanceCoverage ? `${m.acceptanceCoverage.covered}/${m.acceptanceCoverage.planned}` : "—";
    const first = m.firstVerifyPassed === null ? "—" : m.firstVerifyPassed ? "✓" : `✕ ${m.firstVerifyFailedSteps.join(", ")}`;
    out.push(
      `| ${m.promptId} | ${m.runId} | ${m.status} | ${usd(m.costUsd)} | ${m.minutes} min | ${usd(m.devCostUsd)} · ${m.devMinutes} min | ${m.fixRounds} | ${first} | ${acceptance} | ${coverage} | ${m.reviewBlocking} |`,
    );
  }
  out.push("", "Acceptance: independent tests passed / run (last full verify). Coverage: test cases the tester covered / planned. Review B/M: blocker and major findings in the first review.");
  return `${out.join("\n")}\n`;
}

function delta(now: number | null, before: number | null, better: "lower" | "higher"): string {
  if (now === null || before === null) return "—";
  const diff = Math.round((now - before) * 1000) / 1000;
  if (diff === 0) return "same";
  const good = better === "lower" ? diff < 0 : diff > 0;
  return `${diff > 0 ? "+" : ""}${diff} ${good ? "✓" : "✕"}`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function usd(value: number): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}
