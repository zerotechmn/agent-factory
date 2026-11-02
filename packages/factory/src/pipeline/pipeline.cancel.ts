/**
 * Cancellation for runs in progress. One AbortController per run: the API
 * aborts it, the agent session in flight stops at once, and the pipeline
 * checks it between stages and while waiting for the customer.
 */
const controllers = new Map<string, AbortController>();

/** Thrown inside the pipeline when its run was cancelled; executeRun turns it into a "cancelled" run. */
export class RunCancelledError extends Error {
  constructor() {
    super("Cancelled by the user");
  }
}

export function registerRun(runId: string): AbortSignal {
  const controller = new AbortController();
  controllers.set(runId, controller);
  return controller.signal;
}

export function unregisterRun(runId: string): void {
  controllers.delete(runId);
}

/** Returns false when this process isn't running the run (e.g. it is only queued). */
export function cancelRun(runId: string): boolean {
  const controller = controllers.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function isCancelled(runId: string): boolean {
  return controllers.get(runId)?.signal.aborted ?? false;
}

export function throwIfCancelled(runId: string): void {
  if (isCancelled(runId)) throw new RunCancelledError();
}
