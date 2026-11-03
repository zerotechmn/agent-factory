import { useState } from "react";
import { useLocation } from "wouter";

import { Alert, Button } from "../../design-system";
import { forgetRun } from "../recent-runs";
import { TERMINAL_STATUSES } from "../runs.constants";
import { useCancelRun, useDeleteRun } from "../runs.hooks";
import type { Run } from "../runs.types";

/** Cancel while a build is active, delete once it has finished; both confirm inline first. */
export function RunActions({ run }: { run: Run }) {
  const [confirming, setConfirming] = useState(false);
  const [, navigate] = useLocation();
  const cancel = useCancelRun(run.id);
  const remove = useDeleteRun(run.id);
  const finished = TERMINAL_STATUSES.includes(run.status);
  const pending = cancel.isPending || remove.isPending;
  const error = cancel.error ?? remove.error;

  const confirm = () => {
    if (finished) {
      remove.mutate(undefined, {
        onSuccess: () => {
          forgetRun(run.id);
          navigate("/");
        },
      });
    } else {
      cancel.mutate(undefined, { onSuccess: () => setConfirming(false) });
    }
  };

  return (
    <div className="border-t border-border pt-4 text-sm">
      {!confirming ? (
        <Button variant="link" size="sm" className="text-ds-fg-sec hover:text-ds-error" onClick={() => setConfirming(true)}>
          {finished ? "Delete this build" : "Cancel this build"}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm">
          <span className="text-ds-fg">
            {finished ? "Delete the app, its data and every report? This can't be undone." : "Cancel this build? It stops now and can't be resumed."}
          </span>
          <Button variant="destructive" size="sm" onClick={confirm} loading={pending}>
            {pending ? (finished ? "Deleting…" : "Cancelling…") : finished ? "Delete" : "Cancel build"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
            Keep it
          </Button>
        </div>
      )}
      {error && (
        <Alert tone="error" className="mt-2">
          {error instanceof Error ? error.message : "That didn't work"}
        </Alert>
      )}
    </div>
  );
}
