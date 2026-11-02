import { z } from "zod";

import { lessonsField } from "../../librarian/librarian.schema";
import { CODE_TOOLS, jsonBlock, lessonsBlock, type AgentDefinition } from "../agents.shared";

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
  lessons: lessonsField.describe("Reusable lessons about broken TESTS you fixed (step \"tests\"): runner config, flaky timing, test isolation. Engineering knowledge only, never the product or its data. Empty if none."),
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
  buildPrompt: (ctx) => `The factory's automated verify gate ran this app's tests and some failed. Triage the failures.

Follow the factory:systematic-debugging skill: read the errors, reproduce each failure, and trace it to its root cause before deciding anything.

For each failing test, decide:
- The test is wrong (bad assertion, wrong expectation versus the test plan, flaky timing, missing setup, bad test command): fix the TEST files or test configuration yourself.
- The application is wrong: do NOT touch application code. Record it in appBugs with enough detail for the developer to fix it.
${ctx.gate?.logs.acceptance ? ACCEPTANCE_RULES : ""}
Then re-run what failed. Set passed=true only if everything that failed now passes after your test fixes.
${lessonsBlock("Earlier factory runs fixed failures like these. Check whether they apply before debugging", ctx.lessons)}
${jsonBlock("Verify gate failure", {
    acceptanceLog: ctx.gate?.logs.acceptance,
    command: ctx.gate?.tests?.command,
    log: ctx.gate?.logs.tests,
    timedOut: ctx.gate?.tests?.timedOut,
  })}

${jsonBlock("Test plan", ctx.handoffs.testCases)}${
    ctx.gate?.logs.acceptance ? `\n\n${jsonBlock("Architecture contract (what the acceptance tests code against)", contractOf(ctx.handoffs.architecture))}` : ""
  }`,
  cwd: (ctx) => ctx.workspaceDir,
  role: "QA Tester",
  runtime: "code",
  schema,
};

/**
 * The acceptance suite is black-box and written by an independent tester
 * from the contract, so "the test is wrong" has a narrower meaning there.
 */
const ACCEPTANCE_RULES = `
Acceptance tests (acceptance/*.test.mjs) were written by an independent tester from the architecture's API contract, without seeing the code. They run against the running app over HTTP (and a browser for e2e cases):
- If the app deviates from the contract (path, field name, status code, auth, route), that is an APP bug, even when the app's own tests pass.
- Fix an acceptance test only when it contradicts the contract or the test plan, or is flaky. Never weaken an assertion to match the app.
- To re-run them: start the app on a free port, then \`BASE_URL=http://127.0.0.1:<port> PLAYWRIGHT_MODULE=${import.meta.resolve("playwright")} node --test --test-reporter=tap "acceptance/**/*.test.mjs"\`.
`;

function contractOf(architecture: unknown) {
  const arch = (architecture ?? {}) as Record<string, unknown>;
  return { apiEndpoints: arch.apiEndpoints, auth: arch.auth, routes: arch.routes };
}
