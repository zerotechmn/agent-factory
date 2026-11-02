export class HttpError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
export const badRequest = (msg, errors) => new HttpError(400, msg, errors);
export const forbidden = (msg = 'You do not have permission to do this.') => new HttpError(403, msg);
export const notFound = (msg = 'Not found.') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

export function validationError(errors) {
  const first = Object.values(errors)[0];
  return badRequest(first, errors);
}
