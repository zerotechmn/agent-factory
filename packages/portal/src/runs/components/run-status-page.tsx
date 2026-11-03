import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { Alert } from "../../design-system";
import { REDIRECT_DELAY_MS, TERMINAL_STATUSES } from "../runs.constants";
import { useRun } from "../runs.hooks";
import { isLive } from "../runs.utils";
import { RunActions } from "./run-actions";
import { PanelToggle, RunPage } from "./run-chrome";
import { RunFeedback } from "./run-feedback";
import { RunLiveBanner } from "./run-live-banner";
import { CurrentStage, currentStage } from "./run-pipeline";
import { RunQuestions } from "./run-questions";
import { RunRail } from "./run-rail";

export function RunStatusPage({ id }: { id: string }) {
  const { data: run, error, isLoading } = useRun(id);
  const [redirectCancelled, setRedirectCancelled] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const live = run ? isLive(run) : false;
  const focus = run && currentStage(run.stages);
  // Redirect only when the build finishes while you watch; coming back later (e.g. to give feedback) stays here.
  const watchedBuild = useRef(false);
  if (run && !TERMINAL_STATUSES.includes(run.status)) watchedBuild.current = true;

  useEffect(() => {
    if (!live || redirectCancelled || !run?.appUrl || !watchedBuild.current) return;
    const timer = setTimeout(() => window.location.assign(run.appUrl!), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [live, redirectCancelled, run?.appUrl]);

  if (isLoading) return <RunPage id={id}><PageSkeleton /></RunPage>;
  if (error || !run) {
    return (
      <RunPage id={id}>
        <Alert tone="error" title="This run could not be loaded">
          {error instanceof Error ? error.message : "It may have been deleted, or the link is wrong."}{" "}
          <Link href="/" className="text-ds-fg underline underline-offset-4">Start a new run</Link>
        </Alert>
      </RunPage>
    );
  }

  return (
    <RunPage id={id} run={run} trailing={<PanelToggle label="run details" onToggle={() => setPanelOpen((open) => !open)} open={panelOpen} />}>
      <div className={cn("grid items-start gap-8", panelOpen && "lg:grid-cols-[minmax(0,1fr)_22rem]")}>
        <div className="flex min-w-0 flex-col gap-6 pt-3">
          {live && (
            <RunLiveBanner
              appUrl={run.appUrl!}
              onStay={() => setRedirectCancelled(true)}
              redirecting={!redirectCancelled && watchedBuild.current}
              status={run.status}
            />
          )}
          {(live || run.revisions.length > 0) && <RunFeedback canSubmit={live} revisions={run.revisions} runId={run.id} />}
          {run.status === "waiting_customer" && run.questions && <RunQuestions key={run.questions.checkpoint} open={run.questions} runId={run.id} />}
          {run.status === "queued" && run.queuePosition !== null && <Alert>Waiting in queue, position {run.queuePosition}.</Alert>}
          {run.stopReason && <Alert tone="warning">{run.stopReason}</Alert>}

          {focus && <CurrentStage activity={run.activity} now={Date.now()} stage={focus} />}
          <RunActions run={run} />
        </div>

        {panelOpen && (
          <aside aria-label="Run details" className="flex flex-col gap-3">
            <RunRail run={run} />
          </aside>
        )}
      </div>
    </RunPage>
  );
}

/** Holds the page's shape while the run loads, so nothing jumps when it arrives. */
function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading run" className="grid gap-8 pt-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <Skeleton className="h-14 max-w-3xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
    </div>
  );
}
