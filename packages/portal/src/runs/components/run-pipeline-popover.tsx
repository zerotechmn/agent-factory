import { IconSelector } from "@tabler/icons-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { AGENT_LOOKS, FALLBACK_LOOK } from "../../agents/agents.constants";
import { AgentAvatar } from "../../agents/components/agent-avatar";
import { STAGE_MOODS } from "../runs.constants";
import type { Run } from "../runs.types";
import { buildPipeline, formatDuration, formatUsd } from "../runs.utils";
import { StatusLabel } from "./run-pipeline";

/** The run's avatar in the top bar; opening it shows the whole path: what is done, what is working, what comes next. */
export function PipelinePopover({ run }: { run: Run }) {
  const steps = buildPipeline(run);
  const current = steps.find((s) => s.stage?.status === "running");
  const latest = run.stages.at(-1);
  const now = Date.now();
  const agentName = latest ? (AGENT_LOOKS[latest.stageKey] ?? FALLBACK_LOOK).name : "Not started";

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${agentName}: show where this run is going`}
        className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-ds-card-2 pr-1 pl-1.5 text-sm transition-colors hover:bg-ds-card-3 aria-expanded:bg-ds-card-3 focus-visible:outline-2 focus-visible:outline-ds-accent"
      >
        <AgentAvatar mood={latest ? STAGE_MOODS[latest.status] : "idle"} size={20} stageKey={latest?.stageKey ?? "development"} />
        <span className="hidden sm:inline">{agentName}</span>
        <IconSelector className="size-3.5 text-ds-fg opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <div className="flex items-baseline justify-between gap-3 px-1 pb-2">
          <h2 className="text-sm font-medium">Pipeline</h2>
          <p className="text-xs text-ds-fg-sec">
            {current ? `Step ${steps.indexOf(current) + 1} of ${steps.length}` : `${steps.filter((s) => s.stage?.status === "succeeded").length} of ${steps.length} done`}
          </p>
        </div>
        <ol>
          {steps.map((step) => {
            const { stage } = step;
            return (
              <li
                key={step.key}
                className={cn("flex items-center gap-2.5 rounded-md px-1 py-1.5", stage?.status === "running" && "bg-ds-card-warm")}
                aria-current={stage?.status === "running" ? "step" : undefined}
              >
                <AgentAvatar className={stage ? undefined : "opacity-40"} mood={stage ? STAGE_MOODS[stage.status] : "waiting"} size={20} stageKey={step.stageKey} />
                <span className={cn("min-w-0 flex-1 truncate text-sm", !stage && "text-ds-fg-ter")}>{step.label}</span>
                {stage ? (
                  <span className="flex shrink-0 items-center gap-2">
                    {stage.status !== "skipped" && (
                      <span className="text-xs tabular-nums text-ds-fg-sec">
                        {formatDuration(stage.startedAt, stage.finishedAt ? Date.parse(stage.finishedAt) : now)} · {formatUsd(stage.costUsd)}
                      </span>
                    )}
                    <StatusLabel status={stage.status} />
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-ds-fg-ter">Up next</span>
                )}
              </li>
            );
          })}
        </ol>
      </PopoverContent>
    </Popover>
  );
}
