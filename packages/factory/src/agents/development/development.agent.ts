import { z } from "zod";

import { lessonsField } from "../../librarian/librarian.schema";
import { CODE_TOOLS, jsonBlock, lessonsBlock, libraryBlock, type AgentDefinition, type StageContext } from "../agents.shared";
import { asPrd } from "../requirements/requirements.utils";
import { DEVELOPMENT_TOOL_NAMES, developmentMcpServer } from "./development.tools";

const schema = z.object({
  buildVerified: z.boolean().describe("True only if you ran install + tests + started the server and hit /health"),
  commands: z.object({ install: z.string(), start: z.string(), test: z.string() }),
  filesChanged: z.array(z.string()),
  knownGaps: z.array(z.string()).describe("Anything not implemented or not working"),
  lessons: lessonsField,
  notes: z
    .string()
    .describe("When the app is built in parts: conventions or a summary for the sessions after you (the request says what). Otherwise \"\""),
  screens: z
    .array(
      z.object({
        note: z.string().describe("Anything the URL alone can't set up, or \"\""),
        path: z
          .string()
          .nullable()
          .describe("Path from the app root that opens this screen showing seed data, e.g. /#/items/1 or /settings; null if no URL can reach it"),
        screenId: z.string().describe("PRD screen id, e.g. S-05"),
      }),
    )
    .describe("Every PRD screen; the factory opens each in a real browser to check the layout"),
  testsWritten: z.array(z.string()).describe("Test case ids now covered by automated tests"),
});

export const developmentAgent: AgentDefinition<typeof schema> = {
  allowedTools: [...CODE_TOOLS, ...DEVELOPMENT_TOOL_NAMES],
  buildPrompt: (ctx) => (ctx.fix ? fixPrompt(ctx) : ctx.revision ? changePrompt(ctx) : buildPrompt(ctx)),
  cwd: (ctx) => ctx.workspaceDir,
  mcpServers: (ctx) => ({ browser: developmentMcpServer(ctx.stageDir, ctx.checkMobile) }),
  role: "Developer",
  runtime: "code",
  schema,
};

function buildPrompt(ctx: StageContext): string {
  if (ctx.devPart?.kind === "scaffold") return scaffoldPrompt(ctx);
  if (ctx.devPart?.kind === "feature") return featurePrompt(ctx, ctx.devPart);
  if (ctx.devPart?.kind === "finish") return finishPrompt(ctx, ctx.devPart);
  return `Implement the application in the current directory (the workspace root), following the architecture and the UI/UX design.

${skillsLine(ctx)}

Work in this order:
1. Scaffold the project and the Dockerfile exactly per the application contract. Install the library majors the architecture chose (the librarian's docs match them).
2. Implement features story by story, test first: follow the factory:test-driven-development skill, turning each test-plan case into a failing automated test before writing the code that makes it pass (api/unit cases required; e2e cases may be HTTP-level tests if a browser is impractical). Work in small cycles; your budget is limited, so don't rewrite working code just to restart a cycle.
3. ${frontendRule(ctx)}
4. ${VERIFY_RULE}
5. ${SEED_RULE}
6. ${routesRule(ctx)}
7. Write a short README.md (what it is, how to run, how to test).

${TEST_NAMING}

${CONTRACT_RULE}

${CLEAN_CHECKOUT}

${IGNORE_FILES}
${lessonsBlock("Problems earlier factory runs hit most often with this stack, and the fixes that passed verify. Avoid them from the start", ctx.lessons)}${libraryBlock(
    ctx.libraryIndex,
    { catalogHint: "copy one with catalog_get instead of writing it from scratch" },
  )}
${jsonBlock("PRD", ctx.handoffs.requirements)}

${jsonBlock("Test plan", ctx.handoffs.testCases)}

${jsonBlock("Architecture", ctx.handoffs.architecture)}${ctx.handoffs.uiDesign ? `\n\n${jsonBlock("UI/UX design", ctx.handoffs.uiDesign)}` : ""}`;
}

// ---- building in parts: scaffold, one session per feature group, finish ----

/**
 * The foundation every feature session builds on. It sets up the whole data
 * model and the app shell once, so feature sessions add to a known structure
 * instead of each inventing (and fighting over) their own.
 */
function scaffoldPrompt(ctx: StageContext): string {
  return `Build the foundation of this application in the current directory (the workspace root). Separate developer sessions then add the features one group at a time on top of it, each seeing only its own part of the spec, so what you set up here is what they all build on.

${skillsLine(ctx)}

Build only the foundation, no feature behaviour:
1. Scaffold the project and the Dockerfile exactly per the application contract. Install the library majors the architecture chose (the librarian's docs match them).
2. The data layer for every entity in the architecture's data model (schema, tables, migrations), including entities only later features use.
3. The server: its routing structure, error handling, GET /health, and authentication exactly as the contract's auth says (every feature uses it).
4. The frontend shell: ${shellRule(ctx)} Give every PRD screen a placeholder route at its contract route; the feature sessions fill them in.
5. The test setup: the test command runs the whole suite with isolated test data, and one test (e.g. GET /health) passes.
6. An empty seed function that runs when the database is empty; the feature sessions add their records to it.
7. Verify: run install and the test suite with the exact commands you report, start the server on a free port in the background, curl /health, call the browser_check tool on "/", then stop the server.

In notes, write the conventions every feature session must follow, in at most 25 lines: where API routes, handlers, screens, components, tests and seed records go; how to add a screen to the menu and router; how a test gets isolated data and acts as a role; the exact install, test and start commands. It is the only orientation they get besides the code.

Report screens as [] and testsWritten as [] unless you built them.

${CONTRACT_RULE}

${CLEAN_CHECKOUT}

${IGNORE_FILES}
${lessonsBlock("Problems earlier factory runs hit most often with this stack, and the fixes that passed verify. Avoid them from the start", ctx.lessons)}${libraryBlock(
    ctx.libraryIndex,
    { catalogHint: "copy one with catalog_get instead of writing it from scratch" },
  )}
${jsonBlock("PRD outline (entities, roles, screens; features come later)", prdOutline(ctx.handoffs.requirements))}

${jsonBlock("Architecture", ctx.handoffs.architecture)}${ctx.handoffs.uiDesign ? `\n\n${jsonBlock("UI/UX design (everything except the per-screen designs)", designShell(ctx.handoffs.uiDesign))}` : ""}`;
}

/** One feature group, in a fresh session that sees only its slice of the spec. */
function featurePrompt(ctx: StageContext, part: Extract<NonNullable<StageContext["devPart"]>, { kind: "feature" }>): string {
  const { previous, slice } = part;
  const names = slice.features.map((f) => `${f.id} ${f.name}`).join(", ");
  return `Add feature group ${slice.id} (${names}) to the application in the current directory. The foundation and the earlier feature groups are already built and committed; other sessions build the remaining groups after you, so stay inside your part.

Start with \`git log --stat -8\` and the notes below, then read only the files you need. Follow the foundation's conventions. Don't restructure or rewrite earlier work; if you have to change shared code, keep every earlier test passing.

${skillsLine(ctx)}

Work in this order:
1. Test first: turn each of your test cases into a failing automated test, then write the code that makes it pass. Small cycles; your budget is limited.
2. Implement your API endpoints exactly as the contract below says, and your screens at their contract routes (replacing their placeholders). ${frontendRule(ctx)}
3. Add realistic seed records your screens need to the seed function, including one record with very long text. Where your screens show things people expect to see pictured, use real photo URLs that load (for example images.unsplash.com).
4. Verify: run the FULL test suite (not just yours) with the exact commands from the notes, start the server on a free port in the background, call browser_check with your screens' paths, fix what it reports until clean, then stop the server.

${TEST_NAMING}

In screens, report each of your screens with the path that opens it showing seed data. In testsWritten, report your test case ids that now pass. In notes, write one short paragraph for the sessions after you: what you added, where, and anything they must know (shared code you changed, a helper they can reuse). Report commands only if you changed them.

Anything outside your slice (another feature, a rule, a screen) can be looked up with spec_get and spec_trace.

${CONTRACT_RULE}
${jsonBlock("Notes from the foundation and earlier feature groups", previous)}

${jsonBlock("Your features (acceptance criteria included)", slice.features)}

${jsonBlock("Business rules your features use", slice.rules)}

${jsonBlock("Your screens", slice.screens)}

${jsonBlock("Your test cases", slice.testCases)}

${jsonBlock("Your API contract", { auth: (ctx.handoffs.architecture as { auth?: unknown } | undefined)?.auth ?? null, endpoints: slice.endpoints })}

${jsonBlock("Entities your screens use", slice.entities)}${slice.uiScreens.length ? `\n\n${jsonBlock("UI/UX design of your screens", slice.uiScreens)}` : ""}`;
}

/** The last part: everything together, checked as the factory will check it. */
function finishPrompt(ctx: StageContext, part: Extract<NonNullable<StageContext["devPart"]>, { kind: "finish" }>): string {
  return `Every feature group of this application has been built in its own session (summaries below). Finish it for delivery; don't add features.

${skillsLine(ctx)}

1. ${SEED_RULE}
2. ${routesRule(ctx)}
3. ${VERIFY_RULE} Fix whatever fails at its root cause, test first.
4. Write a short README.md (what it is, how to run, how to test).

Known gaps from earlier sessions are listed below: fix them if they are small, otherwise carry them into knownGaps.

This is the final development handoff: report the exact commands, every screen with its path, every test case id now covered by a passing test, and buildVerified only with the evidence from step 3.

${CLEAN_CHECKOUT}

${IGNORE_FILES}

${jsonBlock("What each session built", part.previous)}

${jsonBlock("PRD screens (every one must be reachable and pass the browser check)", screensOutline(ctx.handoffs.requirements))}

${jsonBlock("Architecture (commands and routes)", architectureOutline(ctx.handoffs.architecture))}`;
}

// ---- rules shared by the single-session and the part prompts ----

function skillsLine(ctx: StageContext): string {
  return `Before writing any code, load these skills with the Skill tool and follow them: factory:test-driven-development, factory:verification-before-completion, ${ctx.designSystem === "zt" ? "factory:zt-design-system" : "factory:frontend-design"} and factory:web-interface-guidelines. The reviewer checks your work against them${ctx.designSystem === "zt" ? "; where the web interface guidelines and the ZT Design System disagree, ZT wins" : ""}.`;
}

function frontendRule(ctx: StageContext): string {
  return ctx.designSystem === "zt"
    ? `Build the frontend with React and antd@6 exactly as the factory:zt-design-system skill says: the §13 setup (ConfigProvider with the UI design's colorPrimary and its antdLocale, the App wrapper), the §2 app shell with the UI design's menu, and every screen from the UI design's screens list with its template, components, actions (hidden or disabled per §5) and all its states (§9). Copy follows §11 in the UI language. No inline colours or pixel values.${ctx.handoffs.uiDesign ? "" : " No UI design is available for this run, so derive templates and components from the PRD screens yourself with the skill."}`
    : ctx.handoffs.uiDesign
      ? "Build the UI from the UI/UX design: put every design token in the architecture's stylesheet as a CSS custom property and style only with those variables (no other hex values, font sizes or spacing). Build the listed components, follow each screen's layout and mobile behaviour, and implement every state's treatment and every interaction's feedback. Meet its accessibility rules, and follow the factory:web-interface-guidelines skill in all UI code: it is the baseline the spec doesn't restate (labels, focus, forms, motion, copy), and the reviewer checks it. The factory:frontend-design skill has guidance for anything the spec leaves open."
      : "No UI/UX design is available for this run: choose a deliberate visual direction yourself with the factory:frontend-design skill, define it as CSS custom properties in the architecture's stylesheet, and implement every state each PRD screen defines. Follow the factory:web-interface-guidelines skill in all UI code; the reviewer checks it.";
}

/** The scaffold's share of the frontend: the shell only, the screens come later. */
function shellRule(ctx: StageContext): string {
  return ctx.designSystem === "zt"
    ? "React and antd@6 per the factory:zt-design-system skill: the §13 setup (ConfigProvider with the UI design's colorPrimary and its antdLocale, the App wrapper) and the §2 app shell with the UI design's menu. No inline colours or pixel values."
    : ctx.handoffs.uiDesign
      ? "Every design token from the UI/UX design in the architecture's stylesheet as a CSS custom property, the shared components the design lists, and the app layout and navigation. Follow the factory:web-interface-guidelines skill."
      : "Choose a deliberate visual direction with the factory:frontend-design skill, define it as CSS custom properties in the architecture's stylesheet, and build the app layout and navigation.";
}

function routesRule(ctx: StageContext): string {
  return `Make every PRD screen reachable by URL (a route or hash route, e.g. /#/items/1 using a seeded id) and report the map in screens. After you finish, the factory opens each screen in a real browser at ${ctx.checkMobile ? "desktop and phone width" : "desktop width (this design is desktop-first)"} and fails the build on broken or overflowing text, sideways scrolling, broken images, JS errors and serious accessibility violations. The browser_check tool runs exactly those checks against your local server, so use it instead of guessing. Never install Playwright, Puppeteer or browsers yourself: a browser is already provided through that tool, and installs are slow and fail here.`;
}

const VERIFY_RULE =
  "Verify, following the factory:verification-before-completion skill: run install and the full test suite with the exact commands you report, start the server on a free port in the background, curl /health and /, call the browser_check tool with every screen path (see step 6), fix what it reports and re-run it until clean, then stop the server. Report buildVerified=true only with that evidence.";

const SEED_RULE =
  "Seed demo data: when the app starts with an empty database, insert a small, realistic dataset so every screen has something to show. Include at least one record with very long text (a long name, title or description) to exercise layouts. Where the product shows things people expect to see pictured (for example goods, places, people or listings), give seed records real photo URLs that load (for example images.unsplash.com), and render every image with width/height or an aspect ratio plus the design's fallback for missing or broken images. The factory's browser check fails the build on any image that doesn't load. Tests must keep using their own isolated data.";

const TEST_NAMING = 'Name every automated test after its test case id, e.g. "TC-3: rejects an end date before the start".';

const CONTRACT_RULE =
  "Implement the API exactly as the architecture's contract says: paths, field names, request and response shapes, status codes, errors and auth. Serve every screen at its contract route (the UI design's route on ZT runs, otherwise the architecture's routes). An independent tester is writing black-box acceptance tests against that contract right now; they run against your container in verify, and you won't see them before then.";

const CLEAN_CHECKOUT =
  "After you finish, the factory itself re-runs your install and test commands, builds the Dockerfile and checks /health, so those commands must work from a clean checkout.";

const IGNORE_FILES = "Do not commit node_modules, virtualenvs or build output; add a .gitignore and a .dockerignore.";

// ---- compact views of the spec for the part prompts ----

function prdOutline(handoff: unknown) {
  const prd = asPrd(handoff);
  if (!prd) return handoff;
  return {
    entities: prd.entities,
    nonFunctional: prd.nonFunctional,
    objective: prd.objective,
    roles: prd.roles,
    screens: prd.screens.map(({ featureIds, id, name, roles }) => ({ featureIds, id, name, roles })),
    title: prd.title,
  };
}

function screensOutline(handoff: unknown) {
  const prd = asPrd(handoff);
  return prd ? prd.screens.map(({ featureIds, id, name, states }) => ({ featureIds, id, name, states: states.map((s) => s.state) })) : handoff;
}

function architectureOutline(handoff: unknown) {
  const arch = (handoff ?? {}) as Record<string, unknown>;
  return { commands: arch.commands, routes: arch.routes, stack: arch.stack };
}

/** The UI design minus its per-screen entries, which go to the feature that builds each screen. */
function designShell(handoff: unknown) {
  if (!handoff || typeof handoff !== "object") return handoff;
  const { screens: _screens, ...rest } = handoff as Record<string, unknown>;
  return rest;
}

function fixPrompt(ctx: StageContext): string {
  const fix = ctx.fix;
  // When this session resumes the original build, the PRD and architecture
  // are already in context; repeating them would only cost tokens.
  return `Fix round ${fix?.attempt}. Since you finished, the factory verified the app and a reviewer read the code. Fix the problems below without regressing anything else.

Follow the factory:systematic-debugging skill: find each root cause before changing code, and add a failing test that reproduces a bug before fixing it. Finish with the factory:verification-before-completion skill: re-run install and the full test suite, check /health, and run the browser_check tool on the screens your fix touched (or all screens for a layout fix). Update commands in your output if they changed.

Fix every blocker/major review finding and every app bug. Ignore minor findings unless they are one-line fixes.

In lessons, record each distinct problem above that you fixed, as general engineering knowledge future apps can reuse.
${lessonsBlock("Earlier factory runs fixed failures like these. Check whether they apply before debugging", ctx.lessons)}
${jsonBlock("Verify gate (automated checks run by the factory)", summarizeGate(fix?.gate ?? null))}

${jsonBlock("Test triage: app bugs found by the tester", fix?.triage ?? null)}

${jsonBlock("Review findings", fix?.review ?? null)}${
    ctx.resumed
      ? ""
      : `\n\n${jsonBlock("PRD", ctx.handoffs.requirements)}\n\n${jsonBlock("Architecture", ctx.handoffs.architecture)}`
  }`;
}

/**
 * A change round on a live app: a fresh session (the original one is gone
 * after a factory rebuild, and resuming it hours later would re-write its
 * whole cache), primed with the stored spec, contract and the developer's
 * own handoff instead of re-reading the codebase.
 */
function changePrompt(ctx: StageContext): string {
  const revision = ctx.revision!;
  return `The app in the current directory is live. The customer gave feedback, and the spec, test plan, architecture and UI design have been updated for it. Implement only those changes.

Start with \`git log --stat -5\` and the files the changes touch; read only what you need. Keep everything else working exactly as it is.

Load factory:test-driven-development and factory:verification-before-completion with the Skill tool (and the design-system skill for UI changes) and follow them: add or update tests for the changed test cases first (named after their ids, e.g. "TC-31: …"), then change the code. Then run install and the full test suite with the exact commands below, start the server, curl /health, and call browser_check on the screens you changed. Report every screen path in screens and the commands in your output, as before.

Implement the API exactly as the updated architecture contract says. The independent tester's acceptance tests are being updated in parallel and will run against your container in verify.

## Customer feedback

${revision.feedback}

## What changed in the spec

${revision.changes.length ? revision.changes.map((c) => `- ${c}`).join("\n") : "- (no spec items changed; the feedback is about how existing behaviour works)"}

${jsonBlock("Your previous handoff (commands, screens, known gaps)", ctx.handoffs.development)}

${jsonBlock("PRD (updated)", ctx.handoffs.requirements)}

${jsonBlock("Test plan (updated)", ctx.handoffs.testCases)}

${jsonBlock("Architecture (updated contract)", ctx.handoffs.architecture)}${ctx.handoffs.uiDesign ? `\n\n${jsonBlock("UI/UX design (updated)", ctx.handoffs.uiDesign)}` : ""}`;
}

function summarizeGate(gate: StageContext["gate"]) {
  if (!gate) return null;
  return { failedSteps: gate.failedSteps, logs: gate.logs, smokeFailures: gate.smoke.filter((s) => !s.ok) };
}
