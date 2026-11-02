import { Link } from "wouter";

import { CARD_CLASS } from "../../runs/components/run-card";
import { RunPage } from "../../runs/components/run-chrome";

import { TERMINAL_STATUSES } from "../../runs/runs.constants";
import { useRun } from "../../runs/runs.hooks";
import { clockTime } from "../../runs/runs.utils";
import { KIND_LABELS, STEP_LABELS } from "../librarian.constants";
import { useRunLibrarian } from "../librarian.hooks";
import type { RunLibrarian } from "../librarian.types";
import { describeTool, plural, runTotals, visibleEvents } from "../librarian.utils";

/** How one build used the library: every lookup and hand-over, with what came back. */
export function RunLibrarianPage({ id }: { id: string }) {
  const { data: run } = useRun(id);
  const live = Boolean(run && !TERMINAL_STATUSES.includes(run.status));
  const { data, error, isLoading } = useRunLibrarian(id, { live });

  return (
    <RunPage
      active="/librarian"
      id={id}
      run={run}
      trailing={<Link href="/librarian" className="text-sm whitespace-nowrap text-ds-fg-sec underline underline-offset-4 hover:text-ds-fg">Whole library</Link>}
      width="max-w-4xl"
    >
      {isLoading && <p className="text-sm text-ds-fg-sec">Loading…</p>}
      {error && <p className="text-sm text-ds-error">{error instanceof Error ? error.message : "Could not load this build's library use"}</p>}
      {data && <RunView data={data} live={live} />}
    </RunPage>
  );
}

function RunView({ data, live }: { data: RunLibrarian; live: boolean }) {
  const totals = runTotals(data);
  const events = visibleEvents(data.events);
  if (events.length === 0 && data.lessonsLearned.length === 0) {
    return (
      <p className="text-sm text-ds-fg-sec">
        {live ? "Nothing yet. Lookups appear here as the agents work." : "This build didn't use the library."}
      </p>
    );
  }
  return (
    <div className="space-y-12">
      {data.stats.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ds-fg-sec">
            <tr className="border-b border-ds-line">
              <th className="py-2 pr-3 font-normal">Stage</th>
              <th className="px-3 py-2 text-right font-normal">Asked</th>
              <th className="px-3 py-2 text-right font-normal">Found</th>
              <th className="py-2 pl-3 text-right font-normal">Handed over</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ds-line">
            {data.stats.map((s) => (
              <tr key={s.stage}>
                <td className="py-2.5 pr-3 break-words">{s.stage}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.pulls}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.withHits}</td>
                <td className="py-2.5 pl-3 text-right tabular-nums">{s.auto}</td>
              </tr>
            ))}
          </tbody>
          {data.stats.length > 1 && (
            <tfoot>
              <tr className="border-t border-ds-line-strong font-medium">
                <td className="py-2.5 pr-3">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{totals.asked}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{totals.found}</td>
                <td className="py-2.5 pl-3 text-right tabular-nums">{totals.handed}</td>
              </tr>
            </tfoot>
          )}
        </table>
      )}

      {data.lessonsLearned.length > 0 && (
        <section>
          <h2 className="type-md">What this build taught the factory</h2>
          <p className="mt-1 text-sm text-ds-fg-sec">Fixes the next check proved. Future builds get them.</p>
          <ul className="mt-4 divide-y divide-ds-line border-y border-ds-line">
            {data.lessonsLearned.map((lesson) => (
              <li key={lesson.id} className="py-4 text-sm">
                <p className="text-xs text-ds-fg-sec">{STEP_LABELS[lesson.step]}</p>
                <p className="mt-1 font-medium break-words">{lesson.problem}</p>
                <p className="mt-1 break-words text-ds-fg-sec">Fix: {lesson.fix}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {events.length > 0 && (
        <section>
          <h2 className="type-md">Timeline</h2>
          <ol className={`${CARD_CLASS} mt-4 divide-y divide-ds-line`}>
            {events.map((event) => {
              const { kind, label } = describeTool(event.tool);
              return (
                <li key={event.id} className="grid gap-x-4 gap-y-1 p-4 sm:grid-cols-[5rem_1fr]">
                  <span className="text-xs leading-5 text-ds-fg-sec tabular-nums">{clockTime(event.at)}</span>
                  <div className="min-w-0 text-sm">
                    <p>
                      {label}
                      {event.query && kind === "asked" && <span className="break-words text-ds-fg-sec">: “{event.query}”</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-ds-fg-sec">
                      {event.stage}
                      {kind !== "limit" && ` · ${KIND_LABELS[kind]}`}
                      {kind === "asked" && event.results.length === 0 && ` · ${event.hits ? plural(event.hits, "result") : "nothing found"}`}
                    </p>
                    {event.results.length > 0 && (
                      <ul className="mt-2 space-y-1 border-l border-ds-line pl-3">
                        {event.results.map((r) => (
                          <li key={r.ref} className="break-words">{r.title}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
