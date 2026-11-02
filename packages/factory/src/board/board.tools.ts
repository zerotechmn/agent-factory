import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

import { applyDeveloperUpdate } from "./board.service";

export const BOARD_SERVER = "board";

export const BOARD_TOOL_NAMES = [`mcp__${BOARD_SERVER}__update_tasks`];

/**
 * Lets the developer move its own cards on the run's task board, so people
 * watching see which feature and screen is being worked on. It can only claim
 * work ("doing", "built"); the verify gate decides "verified" and "failed".
 */
export function boardMcpServer({ actor, runId }: { actor: string; runId: string }) {
  return createSdkMcpServer({
    name: BOARD_SERVER,
    tools: [
      tool(
        "update_tasks",
        "Move cards on the task board people watch. Use PRD feature ids (F-xx) and screen ids (S-xx); test cases (TC-x) move by themselves when a test named after them is written. Send it in the same turn as another tool call; it never needs a turn of its own.",
        {
          tasks: z
            .array(
              z.object({
                id: z.string().describe("F-xx or S-xx"),
                note: z.string().max(140).optional().describe("Optional short status, e.g. \"list and filters done; detail next\""),
                status: z.enum(["doing", "built"]).describe("doing: you started it · built: implemented and working locally"),
              }),
            )
            .min(1)
            .max(30),
        },
        async ({ tasks }) => {
          const { moved, unknown } = applyDeveloperUpdate(runId, tasks, { actor });
          const text = `Board updated (${moved.length} moved).${unknown.length ? ` Unknown ids ignored: ${unknown.join(", ")}.` : ""}`;
          return { content: [{ text, type: "text" as const }], isError: false };
        },
      ),
    ],
  });
}
