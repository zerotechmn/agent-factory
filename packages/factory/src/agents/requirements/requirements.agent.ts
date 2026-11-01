import { z } from "zod";

import { jsonBlock, type AgentDefinition } from "../agents.shared";

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

${ctx.handoffs.research ? `Market research on similar products is attached. Use it to fill gaps the user left open (expected features, sensible defaults, known pitfalls) and to inform the MVP cut, but the user's request always wins where they conflict. Record in assumptions any requirement you took from the research.` : "No market research is available for this run; rely on the request and common sense."}

## User request

${ctx.userPrompt}${ctx.handoffs.research ? `\n\n${jsonBlock("Research on similar products", ctx.handoffs.research)}` : ""}`,
  cwd: (ctx) => ctx.stageDir,
  role: "Requirements Analyst",
  runtime: "doc",
  schema,
};
