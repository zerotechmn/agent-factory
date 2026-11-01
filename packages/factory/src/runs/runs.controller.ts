import { httpStatusFor } from "../lib/errors";
import * as RunsService from "./runs.service";

type Envelope = { data: unknown; message: string; status: number; type: "list" | "object" };

export async function createRun({ body, ip }: { body: unknown; ip: string }) {
  return respond(async () => RunsService.createRun({ body, ip }), { message: "Run queued", status: 201 });
}

export async function getRun(id: string) {
  return respond(async () => RunsService.getRunDetail(id));
}

export async function getStageReport(id: string, dirName: string) {
  return respond(async () => RunsService.getStageReport(id, dirName));
}

async function respond(fn: () => Promise<unknown>, { message = "OK", status = 200 } = {}): Promise<Response> {
  try {
    const data = await fn();
    return json({ data, message, status, type: Array.isArray(data) ? "list" : "object" }, status);
  } catch (error) {
    const code = httpStatusFor(error);
    if (code === 500) console.error("[runs] unexpected error", error);
    const text = code === 500 ? "Internal error" : error instanceof Error ? error.message : "Error";
    return json({ data: null, message: text, status: code, type: "object" }, code);
  }
}

function json(body: Envelope, status: number): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}
