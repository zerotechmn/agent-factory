import { z } from "zod";

import { jsonBlock, type AgentDefinition } from "../agents.shared";
import { prdForTestCases, slicePrd } from "../requirements/requirements.utils";

const schema = z.object({
  smokeChecks: z
    .array(
      z.object({
        description: z.string(),
        expectStatus: z.number().int(),
        id: z.string().describe("e.g. SMOKE-1"),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string(),
      }),
    )
    .describe("HTTP checks run against the deployed app; must include GET /health and GET /"),
  testCases: z
    .array(
      z.object({
        acceptanceCriterionIds: z.array(z.string()).min(1),
        given: z.string(),
        id: z.string().describe("e.g. TC-1"),
        then: z.string(),
        title: z.string(),
        type: z.enum(["unit", "api", "e2e"]),
        when: z.string(),
      }),
    )
    .min(1),
});

export const testCasesAgent: AgentDefinition<typeof schema> = {
  allowedTools: [],
  buildPrompt: (ctx) => `Write the test plan for the PRD below, before any design or code exists.

- Cover every acceptance criterion (AC-Fxx-yy) with at least one test case and reference it by id. The PRD's Given/When/Then already has concrete values; keep them.
- Use each business rule's worked example (BRL-xx) as test data, and test both sides of the rule.
- Cover permission denials from the permission matrix, and the error/not-found states screens define.
- Prefer "api" tests (HTTP-level, fast, stack-independent) and "unit" tests; use "e2e" only for flows that genuinely need a browser.
- Keep it proportional: roughly 1-3 cases per criterion.

${jsonBlock("PRD (testable parts)", slicePrd(ctx.handoffs.requirements, prdForTestCases))}`,
  cwd: (ctx) => ctx.stageDir,
  role: "Test Designer",
  runtime: "doc",
  schema,
};
