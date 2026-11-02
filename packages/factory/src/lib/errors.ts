export class ValidationError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
  }
}

export class NotFoundError extends Error {}

export class TooManyRequestsError extends Error {}

/** The request conflicts with the current state, e.g. answering questions the run already moved past. */
export class ConflictError extends Error {}

export function httpStatusFor(error: unknown): number {
  if (error instanceof ValidationError) return 400;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof TooManyRequestsError) return 429;
  if (error instanceof ConflictError) return 409;
  return 500;
}
