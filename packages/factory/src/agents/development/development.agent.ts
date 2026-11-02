import { z } from "zod";

import { BOARD_SERVER, BOARD_TOOL_NAMES, boardMcpServer } from "../../board/board.tools";
import { CODE_TOOLS, jsonBlock, type AgentDefinition, type StageContext } from "../agents.shared";
import { DEVELOPMENT_TOOL_NAMES, developmentMcpServer } from "./development.tools";

const schema = z.object({
  buildVerified: z.boolean().describe("True only if you ran install + tests + started the server and hit /health"),
  commands: z.object({ install: z.string(), start: z.string(), test: z.string() }),
  filesChanged: z.array(z.string()),
  knownGaps: z.array(z.string()).describe("Anything not implemented or not working"),
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
  allowedTools: [...CODE_TOOLS, ...DEVELOPMENT_TOOL_NAMES, ...BOARD_TOOL_NAMES],
  buildPrompt: (ctx) => (ctx.fix ? fixPrompt(ctx) : buildPrompt(ctx)),
  cwd: (ctx) => ctx.workspaceDir,
  mcpServers: (ctx) => ({
    browser: developmentMcpServer(ctx.stageDir, ctx.checkMobile),
    [BOARD_SERVER]: boardMcpServer({ actor: ctx.stageLabel, runId: ctx.runId }),
  }),
  role: "Developer",
  runtime: "code",
  schema,
};

function buildPrompt(ctx: StageContext): string {
  return `Implement the application in the current directory (the workspace root), following the architecture and the UI/UX design.

Before writing any code, load these skills with the Skill tool and follow them: factory:test-driven-development, factory:verification-before-completion, ${ctx.designSystem === "zt" ? "factory:zt-design-system" : "factory:frontend-design"} and factory:web-interface-guidelines. The reviewer checks your work against them${ctx.designSystem === "zt" ? "; where the web interface guidelines and the ZT Design System disagree, ZT wins" : ""}.

Work in this order:
1. Scaffold the project and the Dockerfile exactly per the application contract.
2. Implement features story by story, test first: follow the factory:test-driven-development skill, turning each test-plan case into a failing automated test before writing the code that makes it pass (api/unit cases required; e2e cases may be HTTP-level tests if a browser is impractical). Work in small cycles; your budget is limited, so don't rewrite working code just to restart a cycle.
3. ${
    ctx.designSystem === "zt"
      ? `Build the frontend with React and antd@6 exactly as the factory:zt-design-system skill says: the §13 setup (ConfigProvider with the UI design's colorPrimary and its antdLocale, the App wrapper), the §2 app shell with the UI design's menu, and every screen from the UI design's screens list with its template, components, actions (hidden or disabled per §5) and all its states (§9). Copy follows §11 in the UI language. No inline colours or pixel values.${ctx.handoffs.uiDesign ? "" : " No UI design is available for this run, so derive templates and components from the PRD screens yourself with the skill."}`
      : ctx.handoffs.uiDesign
      ? "Build the UI from the UI/UX design: put every design token in the architecture's stylesheet as a CSS custom property and style only with those variables (no other hex values, font sizes or spacing). Build the listed components, follow each screen's layout and mobile behaviour, and implement every state's treatment and every interaction's feedback. Meet its accessibility rules, and follow the factory:web-interface-guidelines skill in all UI code: it is the baseline the spec doesn't restate (labels, focus, forms, motion, copy), and the reviewer checks it. The factory:frontend-design skill has guidance for anything the spec leaves open."
      : "No UI/UX design is available for this run: choose a deliberate visual direction yourself with the factory:frontend-design skill, define it as CSS custom properties in the architecture's stylesheet, and implement every state each PRD screen defines. Follow the factory:web-interface-guidelines skill in all UI code; the reviewer checks it."
  }
4. Verify, following the factory:verification-before-completion skill: run install and the full test suite with the exact commands you report, start the server on a free port in the background, curl /health and /, call the browser_check tool with every screen path (see step 6), fix what it reports and re-run it until clean, then stop the server. Report buildVerified=true only with that evidence.
5. Seed demo data: when the app starts with an empty database, insert a small, realistic dataset so every screen has something to show. Include at least one record with very long text (a long name, title or description) to exercise layouts. Where the product shows things people expect to see pictured (for example goods, places, people or listings), give seed records real photo URLs that load (for example images.unsplash.com), and render every image with width/height or an aspect ratio plus the design's fallback for missing or broken images. The factory's browser check fails the build on any image that doesn't load. Tests must keep using their own isolated data.
6. Make every PRD screen reachable by URL (a route or hash route, e.g. /#/items/1 using a seeded id) and report the map in screens. After you finish, the factory opens each screen in a real browser at ${ctx.checkMobile ? "desktop and phone width" : "desktop width (this design is desktop-first)"} and fails the build on broken or overflowing text, sideways scrolling, broken images, JS errors and serious accessibility violations. The browser_check tool runs exactly those checks against your local server, so use it instead of guessing. Never install Playwright, Puppeteer or browsers yourself: a browser is already provided through that tool, and installs are slow and fail here.
7. Write a short README.md (what it is, how to run, how to test).

Task board: people watch your progress on a board. Name every automated test after its test case id (e.g. "TC-3: rejects an end date before the start"), and make the test command print one line per test with its result (e.g. node --test's default output, or a verbose/spec reporter): the board moves test cards from your code and from that output. Move feature (F-xx) and screen (S-xx) cards yourself with the update_tasks tool: "doing" when you start one, "built" when it works locally. Batch several ids per call and send it in the same turn as another tool call.

After you finish, the factory itself re-runs your install and test commands, builds the Dockerfile and checks /health, so those commands must work from a clean checkout.

Do not commit node_modules, virtualenvs or build output; add a .gitignore and a .dockerignore.

${jsonBlock("PRD", ctx.handoffs.requirements)}

${jsonBlock("Test plan", ctx.handoffs.testCases)}

${jsonBlock("Architecture", ctx.handoffs.architecture)}${ctx.handoffs.uiDesign ? `\n\n${jsonBlock("UI/UX design", ctx.handoffs.uiDesign)}` : ""}`;
}

function fixPrompt(ctx: StageContext): string {
  const fix = ctx.fix;
  // When this session resumes the original build, the PRD and architecture
  // are already in context; repeating them would only cost tokens.
  return `Fix round ${fix?.attempt}. Since you finished, the factory verified the app and a reviewer read the code. Fix the problems below without regressing anything else.

Follow the factory:systematic-debugging skill: find each root cause before changing code, and add a failing test that reproduces a bug before fixing it. Finish with the factory:verification-before-completion skill: re-run install and the full test suite, check /health, and run the browser_check tool on the screens your fix touched (or all screens for a layout fix). Update commands in your output if they changed.

Fix every blocker/major review finding and every app bug. Ignore minor findings unless they are one-line fixes.

Mark each feature (F-xx) or screen (S-xx) you rework on the task board with the update_tasks tool ("doing", then "built"), sent in the same turn as another tool call.

${jsonBlock("Verify gate (automated checks run by the factory)", summarizeGate(fix?.gate ?? null))}

${jsonBlock("Test triage: app bugs found by the tester", fix?.triage ?? null)}

${jsonBlock("Review findings", fix?.review ?? null)}${
    ctx.resumed
      ? ""
      : `\n\n${jsonBlock("PRD", ctx.handoffs.requirements)}\n\n${jsonBlock("Architecture", ctx.handoffs.architecture)}`
  }`;
}

function summarizeGate(gate: StageContext["gate"]) {
  if (!gate) return null;
  return { failedSteps: gate.failedSteps, logs: gate.logs, smokeFailures: gate.smoke.filter((s) => !s.ok) };
}
