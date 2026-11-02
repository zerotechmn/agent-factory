import { useQueries } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";

import { RUN_STATUS_LABELS, TERMINAL_STATUSES } from "../runs.constants";
import type { Envelope, Run } from "../runs.types";
import { forgetRecentBuild, formatUsd, readRecentBuilds, runIdFrom } from "../runs.utils";

/** Builds started from this browser, plus a box to open any build by its id or link. */
export function RecentBuilds() {
  const [builds, setBuilds] = useState(readRecentBuilds);
  const [, navigate] = useLocation();
  const [pasted, setPasted] = useState("");
  const results = useQueries({
    queries: builds.map((b) => ({
      queryFn: () => fetchRun(b.id),
      queryKey: ["recent-builds", b.id] as const,
      refetchInterval: (query: { state: { data?: Run | null } }) => {
        const status = query.state.data?.status;
        return status && !TERMINAL_STATUSES.includes(status) ? 5_000 : false;
      },
    })),
  });

  // Builds that were deleted (or never existed here) drop off the list.
  const gone = builds.filter((_, i) => results[i]?.data === null).map((b) => b.id);
  useEffect(() => {
    if (!gone.length) return;
    gone.forEach(forgetRecentBuild);
    setBuilds(readRecentBuilds());
  }, [gone.join(",")]);

  const open = (event: FormEvent) => {
    event.preventDefault();
    const id = runIdFrom(pasted);
    if (id) navigate(`/runs/${id}`);
  };

  return (
    <section className="mt-10" aria-labelledby="recent-title">
      <h2 id="recent-title" className="text-sm font-medium text-stone-500">
        Your recent builds
      </h2>
      {builds.length === 0 && <p className="mt-2 text-sm text-stone-500">Builds you start from this browser show up here.</p>}
      <ul className="mt-2 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white empty:hidden">
        {builds.map((b, i) => {
          const run = results[i]?.data;
          if (run === null) return null;
          return (
            <li key={b.id}>
              <Link href={`/runs/${b.id}`} className="flex items-baseline gap-3 px-3 py-2 text-sm hover:bg-stone-50">
                <span className="min-w-0 flex-1 truncate text-stone-800">{b.prompt}</span>
                <span className="shrink-0 text-xs text-stone-500">
                  {run ? `${RUN_STATUS_LABELS[run.status]} · ${formatUsd(run.costUsd)}` : "…"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <form onSubmit={open} className="mt-3 flex gap-2">
        <input
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          placeholder="Open a build by its id or link"
          aria-label="Build id or link"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-stone-500"
        />
        <button type="submit" disabled={!runIdFrom(pasted)} className="rounded-md border border-stone-300 px-3 py-1.5 text-sm disabled:opacity-40">
          Open
        </button>
      </form>
    </section>
  );
}

/** null when the build no longer exists. */
async function fetchRun(id: string): Promise<Run | null> {
  const response = await fetch(`/api/runs/${id}`);
  if (response.status === 404) return null;
  const body = (await response.json().catch(() => null)) as Envelope<Run> | null;
  if (!response.ok || !body) throw new Error(body?.message ?? `Request failed (${response.status})`);
  return body.data;
}
