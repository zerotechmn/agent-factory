import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import { callDeployer } from "../../lib/deployer";

export const DEPLOYER_SERVER = "deployer";

export const DEPLOYMENT_TOOL_NAMES = ["docker_build", "docker_run", "http_check", "container_logs"].map(
  (name) => `mcp__${DEPLOYER_SERVER}__${name}`,
);

/**
 * The factory container has no Docker socket, so agent Bash can't reach the
 * host. These tools are the only path to Docker, and they are scoped to this
 * run's workspace by runId: the agent cannot choose paths or images.
 */
export function deploymentMcpServer(runId: string) {
  return createSdkMcpServer({
    name: DEPLOYER_SERVER,
    tools: [
      tool("docker_build", "Build the Docker image from the workspace root Dockerfile. Returns the build log tail.", {}, async () =>
        toolCall("/build", { runId }),
      ),
      tool(
        "docker_run",
        "(Re)start the app container from the last built image and route it to its public URL. Waits for the container to start.",
        { port: z.number().int().min(1).max(65_535).default(8080).describe("Port the app listens on inside the container") },
        async ({ port }) => toolCall("/run", { port, runId }),
      ),
      tool(
        "http_check",
        "Send a GET request to the running app container and return status code and a body excerpt.",
        { path: z.string().startsWith("/").default("/health") },
        async ({ path }) => toolCall("/check", { path, runId }),
      ),
      tool("container_logs", "Return the last 200 lines of the app container's logs.", {}, async () =>
        toolCall("/logs", { runId }),
      ),
    ],
  });
}

async function toolCall(path: string, body: Record<string, unknown>) {
  const result = await callDeployer(path, body);
  return { content: [{ text: result.body, type: "text" as const }], isError: !result.ok };
}
