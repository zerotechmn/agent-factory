import {
  IconCircleCheckFilled,
  IconCircleDashed,
  IconCircleDot,
  IconCircleHalf2,
  IconCircleXFilled,
  IconLink,
  IconUserCircle,
  IconX,
} from "@tabler/icons-react";
import { useMemo, useState, type ComponentType } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { AGENT_LOOKS, FALLBACK_LOOK } from "../../agents/agents.constants";
import { AgentAvatar } from "../../agents/components/agent-avatar";

import {
  BOARD_COLUMN_LABELS,
  BOARD_COLUMNS,
  CARD_KIND_LABELS,
  PLANNED_STAGES,
  RECENT_MOVE_MS,
  RUN_STATUS_LABELS,
  STAGE_DESCRIPTIONS,
  TERMINAL_STATUSES,
} from "../runs.constants";
import { useBoard, useRun } from "../runs.hooks";
import type { BoardCard, BoardColumn, BoardEvent, CardKind, Stage } from "../runs.types";
import { clockTime, timeAgo } from "../runs.utils";
import { PanelToggle, RunPage } from "./run-chrome";
import { CARD_CLASS } from "./run-card";

/** A column's state as a glyph, repeated on each card so a card still reads on its own. */
const COLUMN_ICONS: Record<BoardColumn, { className: string; Icon: ComponentType<{ className?: string }> }> = {
  built: { className: "text-ds-fg opacity-60", Icon: IconCircleDot },
  doing: { className: "text-ds-accent", Icon: IconCircleHalf2 },
  failed: { className: "text-ds-error", Icon: IconCircleXFilled },
  todo: { className: "text-ds-fg opacity-40", Icon: IconCircleDashed },
  verified: { className: "text-ds-success", Icon: IconCircleCheckFilled },
};

export function RunBoardPage({ id }: { id: string }) {
  const { data: run } = useRun(id);
  const live = Boolean(run && !TERMINAL_STATUSES.includes(run.status));
  const { data: board, error, isLoading } = useBoard(id, { live });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // Re-read on every poll so "moved 5s ago" and the highlight stay current.
  const now = Date.now();

  const assignees = useMemo(() => assigneeByCard(board?.events ?? [], run?.stages ?? []), [board, run]);
  const selected = board?.cards.find((c) => c.id === selectedId) ?? null;

  return (
    <RunPage
      active="/board"
      fill
      id={id}
      run={run}
      trailing={<PanelToggle label="card report and activity" onToggle={() => setPanelOpen((open) => !open)} open={panelOpen} />}
      width="max-w-[100rem]"
    >
      {isLoading && <p className="mt-4 text-ds-fg-sec">Loading…</p>}
      {error && <p className="mt-4 text-ds-error">{error instanceof Error ? error.message : "Could not load the board"}</p>}
      {board && board.cards.length === 0 && (
        <p className="mt-4 rounded-[var(--ds-radius-xs)] bg-ds-card-2 p-4 text-sm text-ds-fg-sec">
          No cards yet. They appear when the requirements and test plan are written.
        </p>
      )}

      {board && board.cards.length > 0 && (
        <div className={cn("grid h-full min-h-0 grid-cols-[minmax(0,1fr)] gap-6", panelOpen && "lg:grid-cols-[minmax(0,1fr)_20rem]")}>
          {/* The page is locked to the viewport: the board scrolls sideways, and each column scrolls on its own. */}
          <div className="min-h-0 min-w-0 overflow-x-auto">
            <div className="grid h-full grid-cols-[repeat(5,minmax(18rem,1fr))] gap-3">
              {BOARD_COLUMNS.map((column) => {
                const inColumn = board.cards.filter((c) => c.column === column.value);
                const { className, Icon } = COLUMN_ICONS[column.value];
                return (
                  <section key={column.value} aria-label={column.label} className="flex min-h-0 min-w-0 flex-col rounded-xl bg-ds-card p-2">
                    <header className="flex shrink-0 items-center gap-2 px-2 py-2" title={column.description}>
                      <Icon className={cn("size-4 shrink-0", className)} aria-hidden />
                      <h2 className="text-sm font-medium text-ds-fg">{column.label}</h2>
                      <span className="text-sm tabular-nums text-ds-fg-sec">{inColumn.length}</span>
                    </header>
                    <ol className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-1">
                      {inColumn.map((card) => (
                        <li key={card.id}>
                          <CardButton
                            card={card}
                            assignee={assignees.get(card.id) ?? null}
                            now={now}
                            onSelect={() => {
                              setSelectedId(card.id === selectedId ? null : card.id);
                              setPanelOpen(true);
                            }}
                            selected={card.id === selectedId}
                          />
                        </li>
                      ))}
                    </ol>
                  </section>
                );
              })}
            </div>
          </div>

          {panelOpen && (
            <aside aria-label="Card report and activity" className="flex min-h-0 flex-col gap-3 overflow-y-auto">
              {selected ? (
                <CardHistory card={selected} events={board.events} onClose={() => setSelectedId(null)} />
              ) : (
                <p className={cn(CARD_CLASS, "p-4 text-sm text-ds-fg-sec")}>Select a card to see its report: where it has been and who moved it.</p>
              )}
              <ActivityFeed cards={board.cards} events={board.events} onSelect={setSelectedId} />
            </aside>
          )}
        </div>
      )}
    </RunPage>
  );
}

function CardButton({
  assignee,
  card,
  now,
  onSelect,
  selected,
}: {
  assignee: Assignee | null;
  card: BoardCard;
  now: number;
  onSelect: () => void;
  selected: boolean;
}) {
  const recent = now - Date.parse(card.updatedAt) < RECENT_MOVE_MS;
  const { className, Icon } = COLUMN_ICONS[card.column];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative block w-full cursor-pointer rounded-lg border bg-[var(--ds-white)] p-3 text-left shadow-[var(--ds-shadow-card)] transition-shadow duration-700 hover:border-ds-line-strong dark:bg-background",
        selected ? "border-ds-fg ring-1 ring-ds-fg" : recent ? "border-ds-accent ring-1 ring-ds-accent" : "border-border",
      )}
    >
      <span className="flex min-h-[18px] items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-wider text-ds-fg-sec uppercase">{card.id}</span>
        {assignee ? (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <AgentAvatar mood={card.column === "doing" ? "working" : "idle"} size={18} stageKey={assignee.stageKey} />
              <span className="sr-only">Assigned to {assignee.name}</span>
            </TooltipTrigger>
            <TooltipContent className="flex-col items-start gap-0.5 py-2">
              <span className="font-medium">{assignee.name}</span>
              <span className="opacity-70">{STAGE_DESCRIPTIONS[assignee.stageKey]}</span>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <IconUserCircle className="size-[18px] text-ds-fg opacity-40" stroke={1.5} aria-hidden />
              <span className="sr-only">Unassigned</span>
            </TooltipTrigger>
            <TooltipContent className="flex-col items-start gap-0.5 py-2">
              <span className="font-medium">Unassigned</span>
              <span className="opacity-70">No agent has worked on this card yet</span>
            </TooltipContent>
          </Tooltip>
        )}
      </span>
      <span className="mt-1.5 flex items-start gap-2">
        <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-hidden />
        <span className="line-clamp-2 text-sm font-medium text-ds-fg">{card.title}</span>
      </span>
      <span className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-ds-fg">
          <span className="size-2 rounded-full" style={{ backgroundColor: (AGENT_LOOKS[KIND_AGENTS[card.kind]] ?? FALLBACK_LOOK).color }} aria-hidden />
          {CARD_KIND_LABELS[card.kind]}
        </span>
        {card.links.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-ds-fg-sec" aria-label={`${card.links.length} linked`}>
            <IconLink className="size-3 text-ds-fg opacity-60" aria-hidden />
            {card.links.length}
          </span>
        )}
      </span>
      <span className="mt-3 block truncate text-xs text-ds-fg-ter">{timeAgo(card.updatedAt, now)}</span>
    </button>
  );
}

function CardHistory({ card, events, onClose }: { card: BoardCard; events: BoardEvent[]; onClose: () => void }) {
  const history = events.filter((e) => e.cardId === card.id).reverse();
  return (
    <section className={cn(CARD_CLASS, "p-4")} aria-label={`${card.id} history`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ds-fg-sec"><span className="font-mono text-[11px] tracking-wider uppercase">{card.id}</span> · {CARD_KIND_LABELS[card.kind]}</p>
          <h2 className="mt-0.5 text-sm font-medium text-ds-fg">{card.title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-m-1 cursor-pointer rounded p-1 text-ds-fg-sec transition-colors hover:text-ds-fg focus-visible:outline-2 focus-visible:outline-ds-accent"
          aria-label="Close card report"
        >
          <IconX className="size-4" aria-hidden />
        </button>
      </div>
      {card.note && <p className="mt-2 text-sm text-ds-fg">{card.note}</p>}
      {card.links.length > 0 && (
        <p className="mt-2 text-xs text-ds-fg-sec">Linked: {card.links.join(", ")}</p>
      )}
      <ol className="mt-4 space-y-3 border-l border-ds-line pl-4">
        {history.map((event) => (
          <li key={event.id} className="relative text-sm">
            <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-ds-fg-ter" />
            <span className="font-medium text-ds-fg">
              {event.from ? `${BOARD_COLUMN_LABELS[event.from]} → ` : "Created in "}
              {BOARD_COLUMN_LABELS[event.to]}
            </span>
            <span className="block text-xs text-ds-fg-sec">{event.actor} · {clockTime(event.at)}</span>
            {event.note && <span className="block text-xs text-ds-fg-sec">{event.note}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ActivityFeed({
  cards,
  events,
  onSelect,
}: {
  cards: BoardCard[];
  events: BoardEvent[];
  onSelect: (id: string) => void;
}) {
  // Creation events are the plan arriving, not movement; they'd bury the moves.
  const moves = events.filter((e) => e.from !== null).slice(0, 40);
  const titles = new Map(cards.map((c) => [c.id, c.title]));
  return (
    <section aria-label="Activity" className={cn(CARD_CLASS, "p-4")}>
      <h2 className="text-sm text-ds-fg-sec">Activity</h2>
      {moves.length === 0 && <p className="mt-2 text-sm text-ds-fg-sec">No cards have moved yet.</p>}
      <ol className="-mx-2 mt-2 max-h-96 divide-y divide-border overflow-y-auto">
        {moves.map((event) => (
          <li key={event.id}>
            <button type="button" onClick={() => onSelect(event.cardId)} className="block w-full cursor-pointer rounded-md px-2 py-2 text-left transition-colors hover:bg-ds-hover focus-visible:outline-2 focus-visible:outline-ds-accent">
              <span className="flex items-baseline gap-2 text-sm">
                <span className="font-mono text-[11px] tracking-wider text-ds-fg-sec uppercase">{event.cardId}</span>
                <span className="text-ds-fg-sec">
                  {BOARD_COLUMN_LABELS[event.from!]} → <span className="text-ds-fg">{BOARD_COLUMN_LABELS[event.to]}</span>
                </span>
              </span>
              <span className="block truncate text-xs text-ds-fg">{titles.get(event.cardId)}</span>
              <span className="block text-xs text-ds-fg-ter">{event.actor} · {clockTime(event.at)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A card's dot takes the colour of the agent that writes that kind of card. */
const KIND_AGENTS: Record<CardKind, string> = { feature: "requirements", screen: "uiDesign", smoke: "verify", test: "testCases" };

type Assignee = { name: string; stageKey: string };

/**
 * The agent that last moved a card. Events are logged under the stage's label, so each one resolves to its
 * agent through the run's stages. A card only created by the plan, never moved, has no assignee.
 */
function assigneeByCard(events: BoardEvent[], stages: Stage[]): Map<string, Assignee> {
  const stageKeys = new Map([...PLANNED_STAGES.map((p) => [p.label, p.key] as const), ...stages.map((s) => [s.label, s.stageKey] as const)]);
  const assignees = new Map<string, Assignee>();
  // Events arrive newest first, so the first move seen per card is the latest.
  for (const event of events) {
    const stageKey = stageKeys.get(event.actor);
    if (event.from === null || !stageKey || assignees.has(event.cardId)) continue;
    assignees.set(event.cardId, { name: (AGENT_LOOKS[stageKey] ?? FALLBACK_LOOK).name, stageKey });
  }
  return assignees;
}
