import { z } from "zod";

import { CODE_TOOLS, jsonBlock, type AgentDefinition } from "../agents.shared";

const schema = z.object({
  appBugs: z
    .array(
      z.object({
        details: z.string().describe("Command, expected vs actual, and the relevant error output"),
        suspectedCause: z.string().describe("File/function and the root cause you traced, if found"),
        testCaseId: z.string().describe("Test plan id, or the failing test's name if it has none"),
      }),
    )
    .describe("Failures caused by application code, for the developer to fix"),
  commandsRun: z.array(z.string()),
  passed: z.boolean().describe("True only if the full test suite now passes"),
  testsFixed: z.array(z.string()).describe("Test files you corrected, and why"),
});

/**
 * Runs only when the verify gate's test step fails. Separating "the test is
 * wrong" from "the app is wrong" is a judgement call the gate can't make,
 * and getting it right stops the developer from bending app code to fit a
 * broken test.
 */
export const testingAgent: AgentDefinition<typeof schema> = {
  allowedTools: CODE_TOOLS,
  buildPrompt: (ctx) => `The factory's automated verify gate ran this app's test suite and it failed. Triage the failures.

Follow the factory:systematic-debugging skill: read the errors, reproduce each failure with the test command, and trace it to its root cause before deciding anything.

For each failing test, decide:
- The test is wrong (bad assertion, wrong expectation versus the test plan, flaky timing, missing setup, bad test command): fix the TEST files or test configuration yourself.
- The application is wrong: do NOT touch application code. Record it in appBugs with enough detail for the developer to fix it.

Then re-run the full suite with the same commands. Set passed=true only if the whole suite passes after your test fixes.

${jsonBlock("Verify gate failure", { command: ctx.gate?.tests?.command, log: ctx.gate?.logs.tests, timedOut: ctx.gate?.tests?.timedOut })}

${jsonBlock("Test plan", ctx.handoffs.testCases)}`,
  cwd: (ctx) => ctx.workspaceDir,
  role: "QA Tester",
  runtime: "code",
  schema,
};
