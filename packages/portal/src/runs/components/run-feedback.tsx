import { useState, type FormEvent } from "react";

import { useSubmitFeedback } from "../runs.hooks";
import type { Revision } from "../runs.types";
import { formatUsd } from "../runs.utils";

const REVISION_STATUS_LABELS: Record<Revision["status"], string> = {
  deployed: "Live",
  failed: "Failed (previous version kept)",
  queued: "Queued",
  running: "In progress",
};

/**
 * Feedback on the deployed app starts a feedback round: the factory updates
 * the same app from its stored spec, contract and tests, and the URL stays.
 */
export function RunFeedback({ canSubmit, revisions, runId }: { canSubmit: boolean; revisions: Revision[]; runId: string }) {
  const [feedback, setFeedback] = useState("");
  const submit = useSubmitFeedback(runId);

  const send = (event: FormEvent) => {
    event.preventDefault();
    submit.mutate(feedback.trim(), { onSuccess: () => setFeedback("") });
  };

  return (
    <section className="mt-6 rounded-lg border border-stone-200 bg-white p-4" aria-labelledby="feedback-title">
      <h2 id="feedback-title" className="font-medium text-stone-900">
        Feedback on your app
      </h2>
      {canSubmit && (
        <form onSubmit={send} className="mt-2 space-y-2">
          <p className="text-sm text-stone-600">
            Describe what to change or add. The factory updates this app at the same address, from its existing spec and code; the current
            version stays live until the new one passes its checks.
          </p>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={3}
            maxLength={2_000}
            aria-label="Feedback"
            placeholder="e.g. Add a search box to the list, and show prices with a currency sign"
            className="w-full resize-y rounded-md border border-stone-300 p-2 text-sm outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
          />
          <button
            type="submit"
            disabled={feedback.trim().length < 10 || submit.isPending}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {submit.isPending ? "Sending…" : "Update the app"}
          </button>
          {submit.error && (
            <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">
              {submit.error instanceof Error ? submit.error.message : "Could not send your feedback"}
            </p>
          )}
        </form>
      )}
      {revisions.length > 0 && (
        <ol className="mt-4 divide-y divide-stone-200 rounded-md border border-stone-200">
          {revisions.map((r) => (
            <li key={r.n} className="px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-stone-900">Round {r.n}</span>
                <span className="text-stone-600">
                  {REVISION_STATUS_LABELS[r.status]} · {formatUsd(r.costUsd)}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-stone-700">{r.feedback}</p>
              {r.note && <p className="mt-0.5 text-xs text-stone-500">{r.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
