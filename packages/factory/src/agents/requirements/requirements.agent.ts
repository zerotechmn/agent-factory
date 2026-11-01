import { z } from "zod";

import type { AgentDefinition } from "../agents.shared";

const schema = z.object({
  acceptanceCriteria: z
    .array(z.object({ description: z.string(), id: z.string().describe("e.g. AC-1"), storyId: z.string() }))
    .min(1),
  assumptions: z.array(z.string()),
  nonFunctional: z.array(z.string()),
  nonGoals: z.array(z.string()).describe("Explicitly out of scope, to keep the build small"),
  summary: z.string(),
  title: z.string().describe("Short product name"),
  userStories: z
    .array(z.object({ asA: z.string(), id: z.string().describe("e.g. US-1"), iWant: z.string(), soThat: z.string() }))
    .min(1),
});

export const requirementsAgent: AgentDefinition<typeof schema> = {
  allowedTools: [],
  buildPrompt: (ctx) => `Turn the user's request below into a concise, buildable requirements specification.

Scope it to what one developer agent can implement and test in a single sitting: a focused MVP, typically 3-8 user stories. Prefer cutting scope (record it under nonGoals) over vague requirements. Every acceptance criterion must be observable and testable.

## User request

${ctx.userPrompt}`,
  cwd: (ctx) => ctx.stageDir,
  role: "Requirements Analyst",
  schema,
};
