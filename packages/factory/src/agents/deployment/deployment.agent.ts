import { z } from "zod";

import { lessonsField } from "../../librarian/librarian.schema";
import { jsonBlock, READ_TOOLS, type AgentDefinition } from "../agents.shared";
import { DEPLOYMENT_TOOL_NAMES, deploymentMcpServer } from "./deployment.tools";

const schema = z.object({
  changes: z.array(z.string()).describe("Files changed and why"),
  containerPort: z.number().int(),
  deployed: z.boolean(),
  healthStatus: z.number().int().nullable(),
  lessons: lessonsField.describe("Reusable lessons about what broke the container (step build, run or health) and the fix. Engineering knowledge only, never the product or its data. Empty if none."),
  notes: z.string(),
});

/**
 * Runs only when the verify gate could not build, start or health-check the
 * container. The happy path needs no agent: the gate deploys by itself.
 */
export const deploymentAgent: AgentDefinition<typeof schema> = {
  allowedTools: [...READ_TOOLS, "Edit", "Write", ...DEPLOYMENT_TOOL_NAMES],
  buildPrompt: (ctx) => `The factory's verify gate could not get this app's container running. Repair the deployment.

1. Read the failure output below, the Dockerfile, .dockerignore and the start command.
2. Fix the cause. Stay within deployment concerns: Dockerfile, .dockerignore, start scripts, build config, binding to 0.0.0.0 and $PORT, and the /health route if it is missing. Do not rewrite application features.
3. Call docker_build, then docker_run with the port the app listens on (normally ${ctx.appPort}; the container receives PORT=<that port>), then http_check on /health and /. On failure read container_logs, fix and repeat.

Report deployed=true only if /health returned 200. The public URL will be ${ctx.appUrl}.

${jsonBlock("Verify gate failure", { failedSteps: ctx.gate?.failedSteps, logs: ctx.gate?.logs, smokeFailures: ctx.gate?.smoke.filter((s) => !s.ok) })}

${jsonBlock("Architecture", ctx.handoffs.architecture)}`,
  cwd: (ctx) => ctx.workspaceDir,
  mcpServers: (ctx) => ({ deployer: deploymentMcpServer(ctx.runId) }),
  role: "Deployment Engineer",
  runtime: "code",
  schema,
};
