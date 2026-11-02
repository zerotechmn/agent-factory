import { jsonBlock, type AgentDefinition, type StageContext } from "../agents.shared";
import { prdForTestCases, slicePrd } from "../requirements/requirements.utils";
import { renderAcceptance } from "./acceptance.report";
import { acceptanceSchema, type Acceptance } from "./acceptance.schema";

/**
 * The independent tester. It turns the test plan into executable black-box
 * tests from the contract alone, in parallel with the developer and without
 * seeing the code, so "tests pass" no longer means the developer graded its
 * own work. Sonnet: this is careful translation, not design.
 */
export const acceptanceAgent: AgentDefinition<typeof acceptanceSchema> = {
  allowedTools: [],
  // A repair resumes the tester's own session; if the resume falls back to a fresh one, it needs the full brief too.
  buildPrompt: (ctx) =>
    ctx.repairIssues ? (ctx.resumed ? repairPrompt(ctx.repairIssues) : `${buildPrompt(ctx)}\n\n${repairPrompt(ctx.repairIssues)}`) : buildPrompt(ctx),
  cwd: (ctx) => ctx.stageDir,
  renderReport: (handoff) => renderAcceptance(handoff as Acceptance),
  role: "Acceptance Tester",
  runtime: "doc",
  schema: acceptanceSchema,
};

function buildPrompt(ctx: StageContext): string {
  return `Write executable acceptance tests for the app described below. A developer is building it right now from the same architecture; you never see the code. Your tests run in the factory's verify step against a fresh copy of the running app, and they are the independent proof that the app does what the PRD says.

## How the tests run
- Plain Node.js ES modules (\`acceptance/<area>.test.mjs\`), using only \`node:test\`, \`node:assert/strict\` and the factory's harness. Nothing else can be imported: no app code, no npm packages.
- Command: \`node --test --test-reporter=tap "acceptance/**/*.test.mjs"\`, with BASE_URL pointing at the app. Fresh, empty database on every run, apart from whatever demo data the app seeds itself on start.
- Harness (\`import { api, uniqueName, withPage } from "./harness.mjs";\`):
  - \`api(method, path, { body, query, role, headers })\` → \`{ status, json, text, headers }\`. \`role\` makes the request as that PRD role, using the auth you describe in \`auth\`. JSON in, JSON out; redirects are not followed.
  - \`withPage(async (page) => { … }, { role })\` → a Playwright page in a fresh browser context (signed in as \`role\`), \`page.goto("/orders")\` relative to the app. Use web-first locators (\`page.getByRole\`, \`getByLabel\`, \`getByText\`) and \`await page.waitForURL\` / \`locator.waitFor()\`; no fixed sleeps.
  - \`uniqueName(prefix)\` → a unique string for names and titles.

## Rules
1. **Every test case exactly once in \`coverage\`.** Name each test after its case: \`test("TC-3: rejects an end date before the start", async () => { … })\`. Several tests may share a case id; group files by feature or area (at most 12 files).
2. **Contract only.** Use exactly the paths, field names, request and response shapes, status codes, errors, auth and routes from the architecture (and the UI design's routes on ZT runs). Never guess an endpoint the contract doesn't list: if a case can't be tested through the contract, mark it \`skipped\` with the reason.
3. **"api" cases** (and "unit" cases whose rule is observable through the API) as HTTP tests. **"e2e" cases** with \`withPage\` at the contract route, only for what needs a browser (navigation, a form's visible validation message, role-based visibility of an action); keep these few and robust.
4. **Independent data.** Each test creates what it needs through the API (with \`uniqueName\`) and asserts on that; never depend on another test, on test order, or on exact seed data or counts. Look items up by the id or name you created.
5. **Use the PRD's concrete values.** The test plan's Given/When/Then and the business rules' worked examples give exact inputs and expected results (amounts, statuses, messages): assert those exactly, both sides of each rule, permission denials by role, and not-found/validation errors with their contract status codes.
6. **Assert what matters, not incidental details:** status codes, field values, state changes visible on a follow-up GET. Don't assert on full error texts in the UI unless the PRD fixes the text.
7. Keep it compact and readable: a small helper per file for repeated setup is fine. No comments restating the code.

## auth
Translate the architecture's \`auth\` into the harness recipe: "none", "header" (\`{ name, value }\` with \`{role}\`), or "login" (\`{ method, path, body }\` with \`{role}\` in the JSON body). For a login that returns a token instead of setting a cookie, fill \`token\` (the response field, the header and prefix to send it with, and the localStorage key the web app reads it from if the contract says); the harness logs in once per role and keeps the cookie or token.

${jsonBlock("Test plan", ctx.handoffs.testCases)}

${jsonBlock("Architecture (the contract)", contractOf(ctx))}

${jsonBlock("PRD (testable parts)", slicePrd(ctx.handoffs.requirements, prdForTestCases))}${uiRoutes(ctx)}`;
}

function repairPrompt(issues: string[]): string {
  return `The factory checked your test files with \`node --check\` and some don't parse. Fix only these problems and return the complete output again (all files, auth and coverage), unchanged otherwise.

${issues.map((issue) => `- ${issue}`).join("\n")}`;
}

/** Only what the tester needs from the architecture: the contract, not the implementation plan. */
function contractOf(ctx: StageContext) {
  const arch = (ctx.handoffs.architecture ?? {}) as Record<string, unknown>;
  return { apiEndpoints: arch.apiEndpoints, auth: arch.auth, routes: arch.routes };
}

function uiRoutes(ctx: StageContext): string {
  const screens = (ctx.handoffs.uiDesign as { screens?: { id: string; name: string; route?: string }[] } | undefined)?.screens;
  const routes = screens?.filter((s) => s.route).map((s) => ({ name: s.name, route: s.route, screenId: s.id }));
  return routes?.length ? `\n\n${jsonBlock("UI design routes (take precedence on ZT runs)", routes)}` : "";
}
