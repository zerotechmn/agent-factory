import { z } from "zod";

import { jsonBlock, READ_TOOLS, type AgentDefinition } from "../agents.shared";
import { DEPLOYMENT_TOOL_NAMES, deploymentMcpServer } from "./deployment.tools";

const schema = z.object({
  containerPort: z.number().int(),
  deployed: z.boolean(),
  healthStatus: z.number().int().nullable(),
  notes: z.string(),
  url: z.string(),
});

export const deploymentAgent: AgentDefinition<typeof schema> = {
  allowedTools: [...READ_TOOLS, "Edit", "Write", ...DEPLOYMENT_TOOL_NAMES],
  buildPrompt: (ctx) => `Deploy the application in the current directory.

1. Read the Dockerfile and check it satisfies the application contract (listens on $PORT, binds 0.0.0.0, single container).
2. Call docker_build. If it fails, fix the Dockerfile/.dockerignore (or a trivial build config issue) and rebuild. Do not rewrite application features.
3. Call docker_run with the port the app listens on (normally ${ctx.appPort}; the container receives PORT=<that port>).
4. Call http_check on /health and /. On failure, read container_logs, fix, rebuild and rerun.
5. Run the GET smoke checks from the test plan with http_check.

The public URL will be ${ctx.appUrl}. Report deployed=true only if /health returned 200.

${jsonBlock("Design", ctx.handoffs.design)}

${jsonBlock("Test plan (smoke checks)", (ctx.handoffs.testCases as { smokeChecks?: unknown } | undefined)?.smokeChecks)}`,
  cwd: (ctx) => ctx.workspaceDir,
  mcpServers: (ctx) => ({ deployer: deploymentMcpServer(ctx.runId) }),
  role: "Deployment Engineer",
  schema,
};
