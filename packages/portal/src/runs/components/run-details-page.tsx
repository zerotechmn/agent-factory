import { useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "wouter";

import { AgentAvatar } from "../../agents/components/agent-avatar";
import { STAGE_MOODS } from "../runs.constants";
import { useRun, useStageReport } from "../runs.hooks";
import { formatUsd } from "../runs.utils";

export function RunDetailsPage({ id }: { id: string }) {
  const { data: run } = useRun(id);
  const [selected, setSelected] = useState<string | null>(null);
  const dirName = selected ?? run?.stages[0]?.dirName ?? null;
  const report = useStageReport(id, dirName);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <Link href={`/runs/${id}`} className="text-sm text-ds-fg-sec transition-colors hover:text-ds-fg">← Back to status</Link>
      <h1 className="mt-6 type-md-lg">Agent reports</h1>
      <p className="mt-1 text-sm text-ds-fg-sec">
        What each stage produced. The PRD and Verify reports are rendered by the factory; other agents write their own.
        Machine handoffs and full transcripts are in the run folder on the factory host (<code>data/runs/{id}</code>).
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-[14rem_1fr]">
        <nav className="flex gap-2 overflow-x-auto md:flex-col">
          {run?.stages.map((stage) => (
            <button
              key={stage.dirName}
              type="button"
              onClick={() => setSelected(stage.dirName)}
              className={`flex shrink-0 items-center gap-2.5 rounded-[var(--ds-radius-xs)] px-3 py-2 text-left text-sm ${
                stage.dirName === dirName ? "bg-ds-fg text-ds-bg" : "bg-ds-card text-ds-fg hover:bg-ds-card-2"
              }`}
            >
              <AgentAvatar mood={STAGE_MOODS[stage.status]} size={20} stageKey={stage.stageKey} />
              <span>
                <span className="block">{stage.label}</span>
                <span className="text-xs opacity-70">{stage.status} · {formatUsd(stage.costUsd)}</span>
              </span>
            </button>
          ))}
        </nav>

        <article className="prose prose-stone min-w-0 max-w-none rounded-[var(--ds-radius-xs)] border border-ds-line bg-ds-card p-6">
          {!dirName && <p>No stages have run yet.</p>}
          {report.isLoading && <p>Loading…</p>}
          {report.error && <p>This stage has not written its report yet.</p>}
          {report.data && (
            <Markdown components={MARKDOWN_COMPONENTS} remarkPlugins={[remarkGfm]}>
              {report.data.markdown}
            </Markdown>
          )}
        </article>
      </div>
    </main>
  );
}

// PRD tables can be wider than a phone screen; scroll them instead of the page.
const MARKDOWN_COMPONENTS: Components = {
  table: ({ node: _node, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
};
