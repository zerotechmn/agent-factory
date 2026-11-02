import { httpStatusFor } from "./errors";

type Envelope = { data: unknown; message: string; status: number; type: "list" | "object" };

/**
 * Runs a controller action and wraps the result in the API envelope. Typed
 * errors (NotFoundError, ValidationError…) become their status with their
 * message; anything else is a logged 500 with a generic message.
 */
export async function respond(fn: () => Promise<unknown> | unknown, { message = "OK", status = 200, tag = "api" } = {}): Promise<Response> {
  try {
    const data = await fn();
    return json({ data, message, status, type: Array.isArray(data) ? "list" : "object" }, status);
  } catch (error) {
    const code = httpStatusFor(error);
    if (code === 500) console.error(`[${tag}] unexpected error`, error);
    const text = code === 500 ? "Internal error" : error instanceof Error ? error.message : "Error";
    return json({ data: null, message: text, status: code, type: "object" }, code);
  }
}

function json(body: Envelope, status: number): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}
