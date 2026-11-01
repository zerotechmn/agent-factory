import { z } from "zod";

import { CODE_TOOLS, jsonBlock, type AgentDefinition, type StageContext } from "../agents.shared";

const schema = z.object({
  buildVerified: z.boolean().describe("True only if you ran install + tests + started the server and hit /health"),
  commands: z.object({ install: z.string(), start: z.string(), test: z.string() }),
  filesChanged: z.array(z.string()),
  knownGaps: z.array(z.string()).describe("Anything not implemented or not working"),
  testsWritten: z.array(z.string()).describe("Test case ids now covered by automated tests"),
});

export const developmentAgent: AgentDefinition<typeof schema> = {
  allowedTools: CODE_TOOLS,
  buildPrompt: (ctx) => (ctx.fix ? fixPrompt(ctx) : buildPrompt(ctx)),
  cwd: (ctx) => ctx.workspaceDir,
  role: "Developer",
  runtime: "code",
  schema,
};

function buildPrompt(ctx: StageContext): string {
  return `Implement the application in the current directory (the workspace root), following the design.

Work in this order:
1. Scaffold the project and the Dockerfile exactly per the application contract.
2. Implement features story by story, test first: follow the factory:test-driven-development skill, turning each test-plan case into a failing automated test before writing the code that makes it pass (api/unit cases required; e2e cases may be HTTP-level tests if a browser is impractical). Work in small cycles; your budget is limited, so don't rewrite working code just to restart a cycle.
3. Build the UI following the design's visual direction (the factory:frontend-design skill has the detail).
4. Verify, following the factory:verification-before-completion skill: run install and the full test suite with the exact commands you report, start the server on a free port in the background, curl /health and /, then stop it. Report buildVerified=true only with that evidence.
5. Write a short README.md (what it is, how to run, how to test).

After you finish, the factory itself re-runs your install and test commands, builds the Dockerfile and checks /health, so those commands must work from a clean checkout.

Do not commit node_modules, virtualenvs or build output; add a .gitignore and a .dockerignore.

${jsonBlock("PRD", ctx.handoffs.requirements)}

${jsonBlock("Test plan", ctx.handoffs.testCases)}

${jsonBlock("Design", ctx.handoffs.design)}`;
}

function fixPrompt(ctx: StageContext): string {
  const fix = ctx.fix;
  // When this session resumes the original build, the requirements and design
  // are already in context; repeating them would only cost tokens.
  return `Fix round ${fix?.attempt}. Since you finished, the factory verified the app and a reviewer read the code. Fix the problems below without regressing anything else.

Follow the factory:systematic-debugging skill: find each root cause before changing code, and add a failing test that reproduces a bug before fixing it. Finish with the factory:verification-before-completion skill: re-run install and the full test suite, and check /health. Update commands in your output if they changed.

Fix every blocker/major review finding and every app bug. Ignore minor findings unless they are one-line fixes.

${jsonBlock("Verify gate (automated checks run by the factory)", summarizeGate(fix?.gate ?? null))}

${jsonBlock("Test triage: app bugs found by the tester", fix?.triage ?? null)}

${jsonBlock("Review findings", fix?.review ?? null)}${
    ctx.resumed
      ? ""
      : `\n\n${jsonBlock("PRD", ctx.handoffs.requirements)}\n\n${jsonBlock("Design", ctx.handoffs.design)}`
  }`;
}

function summarizeGate(gate: StageContext["gate"]) {
  if (!gate) return null;
  return { failedSteps: gate.failedSteps, logs: gate.logs, smokeFailures: gate.smoke.filter((s) => !s.ok) };
}
