export class ValidationError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
  }
}

export class NotFoundError extends Error {}

export class TooManyRequestsError extends Error {}

export function httpStatusFor(error: unknown): number {
  if (error instanceof ValidationError) return 400;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof TooManyRequestsError) return 429;
  return 500;
}
