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
  schema,
};

function buildPrompt(ctx: StageContext): string {
  return `Implement the application in the current directory (the workspace root), following the design.

Work in this order:
1. Scaffold the project and the Dockerfile exactly per the application contract.
2. Implement features story by story.
3. Implement the test plan as automated tests runnable with the design's test command (api/unit cases required; e2e cases may be implemented as HTTP-level tests if a browser is impractical).
4. Verify: install, run the tests until they pass, start the server on a free port in the background, curl /health and /, then stop it.
5. Write a short README.md (what it is, how to run, how to test).

Do not commit node_modules, virtualenvs or build output; add a .gitignore and a .dockerignore.

${jsonBlock("Requirements", ctx.handoffs.requirements)}

${jsonBlock("Test plan", ctx.handoffs.testCases)}

${jsonBlock("Design", ctx.handoffs.design)}`;
}

function fixPrompt(ctx: StageContext): string {
  return `Fix attempt ${ctx.fix?.attempt}. The code in the current directory was reviewed and tested. Fix every blocker/major review finding and every failing test below, without regressing anything else. Re-run the full test suite and the /health check before finishing.

${jsonBlock("Review findings", ctx.fix?.review)}

${jsonBlock("Test results", ctx.fix?.testing)}

${jsonBlock("Requirements", ctx.handoffs.requirements)}

${jsonBlock("Design", ctx.handoffs.design)}`;
}
