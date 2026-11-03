import { IconCheck, IconCopy } from "@tabler/icons-react";
import { Suspense, useEffect, useState } from "react";

import { LazyMessageResponse } from "@/components/ai-elements/lazy-response";

import { AgentAvatar } from "../../agents/components/agent-avatar";
import { Alert, Button, Skeleton, Spinner } from "../../design-system";
import { STAGE_MOODS } from "../runs.constants";
import { useRun, useStageReport } from "../runs.hooks";
import type { Stage } from "../runs.types";
import { formatUsd } from "../runs.utils";
import { RunPage } from "./run-chrome";

const COPIED_MS = 1_500;

export function RunDetailsPage({ id }: { id: string }) {
  const { data: run } = useRun(id);
  const [selected, setSelected] = useState<string | null>(null);
  const stage = run?.stages.find((s) => s.dirName === selected) ?? run?.stages[0] ?? null;
  const live = stage?.status === "running";
  const report = useStageReport(id, stage?.dirName ?? null, { live });

  return (
    <RunPage active="/details" id={id} run={run} width="max-w-5xl">
      <div className="mt-2 grid gap-6 md:grid-cols-[14rem_1fr]">
        <nav aria-label="Stages" className="flex gap-2 overflow-x-auto md:flex-col">
          {run?.stages.map((s) => (
            <button
              key={s.dirName}
              type="button"
              aria-current={s.dirName === stage?.dirName ? "page" : undefined}
              onClick={() => setSelected(s.dirName)}
              className={`flex shrink-0 items-center gap-2.5 rounded-[var(--ds-radius-xs)] px-3 py-2 text-left text-sm ${
                s.dirName === stage?.dirName ? "bg-ds-fg text-ds-bg" : "bg-ds-card text-ds-fg hover:bg-ds-card-2"
              }`}
            >
              <AgentAvatar mood={STAGE_MOODS[s.status]} size={20} stageKey={s.stageKey} />
              <span>
                <span className="block">{s.label}</span>
                <span className="text-xs opacity-70">{s.status} · {formatUsd(s.costUsd)}</span>
              </span>
            </button>
          ))}
        </nav>

        <article
          aria-busy={live || report.isLoading}
          aria-label={stage ? `${stage.label} report` : "Agent report"}
          className="min-w-0 rounded-[var(--ds-radius-xs)] border border-ds-line bg-ds-card"
        >
          {!stage ? (
            <p className="p-6 text-sm text-ds-fg-sec">No stages have run yet.</p>
          ) : report.data ? (
            <>
              <ReportHeader markdown={report.data.markdown} stage={stage} />
              <Suspense fallback={<ReportSkeleton />}>
                <LazyMessageResponse className="px-6 pt-5 pb-6" isAnimating={live}>
                  {report.data.markdown}
                </LazyMessageResponse>
              </Suspense>
            </>
          ) : report.isLoading ? (
            <ReportSkeleton />
          ) : (
            <ReportPending stage={stage} />
          )}
        </article>
      </div>
    </RunPage>
  );
}

function ReportHeader({ markdown, stage }: { markdown: string; stage: Stage }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex items-center justify-between gap-3 border-b border-ds-line py-2 pr-2 pl-6">
      <p className="min-w-0 truncate text-sm text-ds-fg-sec">
        {stage.label} report
        {stage.status === "running" && <span className="ml-2 text-ds-accent">· updating</span>}
      </p>
      <Button
        aria-label={copied ? "Report copied" : "Copy report as Markdown"}
        icon={copied ? <IconCheck className="size-3.5" aria-hidden /> : <IconCopy className="size-3.5" aria-hidden />}
        onClick={() => void navigator.clipboard?.writeText(markdown).then(() => setCopied(true))}
        size="xs"
        variant="ghost"
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-3 p-6" role="status" aria-label="Loading report">
      <Skeleton className="h-6 w-2/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

/** No report yet: the agent is still writing it, or the stage ended without one. */
function ReportPending({ stage }: { stage: Stage }) {
  if (stage.status === "running") {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-ds-fg-sec" role="status">
        <Spinner size="sm" label="Working" />
        {stage.label} is still working. Its report appears here when it finishes.
      </p>
    );
  }
  return (
    <div className="p-6">
      <Alert tone={stage.status === "failed" ? "error" : "info"}>
        {stage.error ?? `${stage.label} did not write a report.`}
      </Alert>
    </div>
  );
}
