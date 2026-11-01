import { z } from "zod";

import { CODE_TOOLS, jsonBlock, type AgentDefinition } from "../agents.shared";

const schema = z.object({
  commandsRun: z.array(z.string()),
  failures: z.array(z.object({ details: z.string(), testCaseId: z.string() })),
  passed: z.boolean().describe("True only if the suite passes and every smoke check passes"),
  results: z.array(
    z.object({ notes: z.string(), status: z.enum(["pass", "fail", "not_run"]), testCaseId: z.string() }),
  ),
});

export const testingAgent: AgentDefinition<typeof schema> = {
  allowedTools: CODE_TOOLS,
  buildPrompt: (ctx) => `Independently verify the application in the current directory.

1. Install dependencies and run the automated test suite with the documented test command.
2. Start the server on a free port in the background and run every smoke check from the test plan with curl; then stop the server.
3. For each test case in the test plan, record pass/fail/not_run. If a planned case has no automated test, verify it manually over HTTP where feasible.

You may add or fix TEST files only (never application code) if a planned test case is missing; the developer fixes app bugs. Report failures with enough detail (command, expected vs actual, error output excerpt) for the developer to fix them.

${jsonBlock("Test plan", ctx.handoffs.testCases)}

${jsonBlock("Design", ctx.handoffs.design)}

${jsonBlock("Developer handoff", ctx.handoffs.development)}`,
  cwd: (ctx) => ctx.workspaceDir,
  role: "QA Tester",
  schema,
};
