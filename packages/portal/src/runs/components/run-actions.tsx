import { useState } from "react";
import { useLocation } from "wouter";

import { TERMINAL_STATUSES } from "../runs.constants";
import { useCancelRun, useDeleteRun } from "../runs.hooks";
import type { Run } from "../runs.types";
import { forgetRecentBuild } from "../runs.utils";

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
          forgetRecentBuild(run.id);
          navigate("/");
        },
      });
    } else {
      cancel.mutate(undefined, { onSuccess: () => setConfirming(false) });
    }
  };

  return (
    <div className="mt-8 border-t border-stone-200 pt-4 text-sm">
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className="text-stone-600 underline underline-offset-4 hover:text-red-700">
          {finished ? "Delete this build" : "Cancel this build"}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm">
          <span className="text-stone-800">
            {finished
              ? "Delete the app, its data and every report? This can't be undone."
              : "Cancel this build? It stops now and can't be resumed."}
          </span>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="rounded-md bg-red-700 px-3 py-1.5 font-medium text-white disabled:opacity-40"
          >
            {pending ? (finished ? "Deleting…" : "Cancelling…") : finished ? "Delete" : "Cancel build"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="rounded-md border border-stone-300 px-3 py-1.5">
            Keep it
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 p-2 text-red-700">
          {error instanceof Error ? error.message : "That didn't work"}
        </p>
      )}
    </div>
  );
}
