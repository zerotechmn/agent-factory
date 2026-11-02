import { Link } from "wouter";

import { TERMINAL_STATUSES } from "../../runs/runs.constants";
import { useRun } from "../../runs/runs.hooks";
import { clockTime } from "../../runs/runs.utils";
import { KIND_STYLES, STEP_LABELS } from "../librarian.constants";
import { useRunLibrarian } from "../librarian.hooks";
import type { RunLibrarian } from "../librarian.types";
import { describeTool, plural, runTotals, visibleEvents } from "../librarian.utils";

/** How one build used the library: every lookup and hand-over, with what came back. */
export function RunLibrarianPage({ id }: { id: string }) {
  const { data: run } = useRun(id);
  const live = Boolean(run && !TERMINAL_STATUSES.includes(run.status));
  const { data, error, isLoading } = useRunLibrarian(id, { live });

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link href={`/runs/${id}`} className="text-sm text-stone-500 hover:text-stone-800">← Back to status</Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">How this build used the library</h1>
      <p className="mt-1 max-w-2xl text-sm text-stone-600">
        Every time an agent looked something up, and every time the factory handed knowledge over on its own, with what it
        returned. <Link href="/librarian" className="underline underline-offset-4">See the whole library</Link>.
      </p>

      {isLoading && <p className="mt-8 text-stone-500">Loading…</p>}
      {error && <p className="mt-8 text-red-700">{error instanceof Error ? error.message : "Could not load this build's library use"}</p>}
      {data && <RunView data={data} live={live} />}
    </main>
  );
}

function RunView({ data, live }: { data: RunLibrarian; live: boolean }) {
  const totals = runTotals(data);
  const events = visibleEvents(data.events);
  if (events.length === 0 && data.lessonsLearned.length === 0) {
    return (
      <p className="mt-8 rounded-lg border border-dashed border-stone-300 p-4 text-sm text-stone-600">
        {live ? "Nothing yet. Lookups appear here as the agents work." : "This build didn't use the library."}
      </p>
    );
  }
  return (
    <>
      <p className="mt-8 rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-800">
        Agents looked things up {plural(totals.asked, "time")} ({totals.found} found something). The factory handed knowledge
        over {plural(totals.handed, "time")}.
        {data.lessonsLearned.length > 0 && ` This build taught the factory ${plural(data.lessonsLearned.length, "lesson")}.`}
      </p>

      {data.stats.length > 0 && (
        <div className="mt-6">
          <table className="w-full rounded-lg border border-stone-200 bg-white text-sm">
            <thead className="bg-stone-50 text-left text-stone-600">
              <tr>
                <th className="px-3 py-2 font-medium sm:px-4">Stage</th>
                <th className="px-3 py-2 text-right font-medium sm:px-4">Asked</th>
                <th className="px-3 py-2 text-right font-medium sm:px-4">Found</th>
                <th className="px-3 py-2 text-right font-medium sm:px-4">Handed over</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {data.stats.map((s) => (
                <tr key={s.stage}>
                  <td className="px-3 py-2 break-words text-stone-900 sm:px-4">{s.stage}</td>
                  <td className="px-3 py-2 text-right tabular-nums sm:px-4">{s.pulls}</td>
                  <td className="px-3 py-2 text-right tabular-nums sm:px-4">{s.withHits}</td>
                  <td className="px-3 py-2 text-right tabular-nums sm:px-4">{s.auto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.lessonsLearned.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">What this build taught the factory</h2>
          <p className="mt-1 mb-4 text-sm text-stone-600">Problems fixed during this build, kept because the next check proved the fix. Future builds get them.</p>
          <ul className="space-y-3">
            {data.lessonsLearned.map((lesson) => (
              <li key={lesson.id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
                <p className="text-xs text-emerald-900">{STEP_LABELS[lesson.step]}</p>
                <p className="mt-1 font-medium break-words text-emerald-950">{lesson.problem}</p>
                <p className="mt-1 break-words text-emerald-900">Fix: {lesson.fix}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {events.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
          <ol className="mt-4 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {events.map((event) => {
              const { kind, label } = describeTool(event.tool);
              return (
                <li key={event.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                    <span className="tabular-nums">{clockTime(event.at)}</span>
                    <span>{event.stage}</span>
                    <span className={`rounded-full px-2 py-0.5 ring-1 ${KIND_STYLES[kind].tone}`}>{KIND_STYLES[kind].label}</span>
                  </div>
                  <p className="mt-1 text-sm text-stone-900">
                    {label}
                    {event.query && kind === "asked" && <span className="break-words text-stone-600">: “{event.query}”</span>}
                  </p>
                  {event.results.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-stone-700">
                      {event.results.map((r) => (
                        <li key={r.ref} className="break-words before:mr-2 before:text-stone-400 before:content-['→']">{r.title}</li>
                      ))}
                    </ul>
                  ) : (
                    kind === "asked" && <p className="mt-1 text-xs text-stone-500">{event.hits ? plural(event.hits, "result") : "Nothing found"}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </>
  );
}
