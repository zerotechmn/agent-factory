import { useState, type FormEvent } from "react";

import { Alert, Button, Textarea } from "../../design-system";
import { useSubmitFeedback } from "../runs.hooks";
import type { Revision } from "../runs.types";
import { formatUsd } from "../runs.utils";
import { CARD_CLASS } from "./run-card";

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
    <section className={`${CARD_CLASS} p-5`} aria-labelledby="feedback-title">
      <h2 id="feedback-title" className="text-ds-fg">
        Feedback on your app
      </h2>
      {canSubmit && (
        <form onSubmit={send} className="mt-2 space-y-2">
          <p className="text-sm text-ds-fg-sec">
            Describe what to change or add. The factory updates this app at the same address, from its existing spec and code; the current
            version stays live until the new one passes its checks.
          </p>
          <Textarea
            value={feedback}
            onValueChange={setFeedback}
            rows={3}
            maxLength={2_000}
            aria-label="Feedback"
            placeholder="e.g. Add a search box to the list, and show prices with a currency sign"
            fieldSize="sm"
            className="min-h-0 resize-y"
          />
          <Button type="submit" size="sm" disabled={feedback.trim().length < 10} loading={submit.isPending}>
            {submit.isPending ? "Sending…" : "Update the app"}
          </Button>
          {submit.error && (
            <Alert tone="error">{submit.error instanceof Error ? submit.error.message : "Could not send your feedback"}</Alert>
          )}
        </form>
      )}
      {revisions.length > 0 && (
        <ol className="mt-4 divide-y divide-ds-line rounded-[var(--ds-radius-xs)] border border-ds-line">
          {revisions.map((r) => (
            <li key={r.n} className="px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ds-fg">Round {r.n}</span>
                <span className="text-ds-fg-sec">
                  {REVISION_STATUS_LABELS[r.status]} · {formatUsd(r.costUsd)}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-ds-fg">{r.feedback}</p>
              {r.note && <p className="mt-0.5 text-xs text-ds-fg-sec">{r.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
