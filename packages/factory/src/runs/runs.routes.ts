import { Elysia } from "elysia";

import * as RunsController from "./runs.controller";

export const runsRoutes = new Elysia({ prefix: "/api/runs" })
  .post("/", ({ body, request, server }) =>
    RunsController.createRun({
      benchmarkToken: request.headers.get("x-benchmark-token"),
      body,
      ip: clientIp(request, server?.requestIP(request)?.address),
    }),
  )
  .get("/:id", ({ params }) => RunsController.getRun(params.id))
  .get("/:id/board", ({ params }) => RunsController.getBoard(params.id))
  .post("/:id/answers", ({ body, params }) => RunsController.answerQuestions(params.id, body))
  .post("/:id/feedback", ({ body, params, request, server }) =>
    RunsController.submitFeedback({ body, id: params.id, ip: clientIp(request, server?.requestIP(request)?.address) }),
  )
  .get("/:id/stages/:dirName/report", ({ params }) => RunsController.getStageReport(params.id, params.dirName));

function clientIp(request: Request, fallback: string | undefined): string {
  // Traefik sets X-Forwarded-For; the left-most entry is the original client.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || fallback || "unknown";
}
