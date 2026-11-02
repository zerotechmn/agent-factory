import { z } from "zod";

import type { AgentDefinition } from "../agents.shared";

const schema = z.object({
  commonFeatures: z
    .array(z.object({ feature: z.string(), seenIn: z.array(z.string()).describe("Product names") }))
    .describe("Features most comparable products share; candidates for the MVP"),
  differentiators: z.array(z.string()).describe("Ideas worth borrowing that set individual products apart"),
  pitfalls: z.array(z.string()).describe("Complaints, UX traps or failure modes users report about these products"),
  questionsForCustomer: z
    .array(
      z.object({
      default: z.string().describe("Your own choice if the customer doesn't answer; must be one of the options"),
      id: z.string().describe("Q-1, Q-2, …"),
      options: z.array(z.string()).min(2).max(4).describe("Short answers the customer can pick, in their language"),
      question: z.string().describe("One clear question in the customer's language"),
      why: z.string().describe("One sentence: what in the app depends on the answer"),
    }),
    )
    .max(4)
    .describe("Only choices that change what gets built and that research can't settle; usually 0-2, often none"),
  products: z
    .array(
      z.object({
        name: z.string(),
        notableFeatures: z.array(z.string()),
        summary: z.string(),
        url: z.string().describe("Source URL you actually visited or saw in search results"),
      }),
    )
    .describe("3-6 comparable products or open-source projects"),
  recommendedMvpScope: z.array(z.string()).describe("Features you recommend for a small first version, most important first"),
  sources: z.array(z.string()).describe("Every URL you relied on"),
  uiPatterns: z.array(z.string()).describe("Layouts and interaction patterns users of this kind of app expect"),
});

export const researchAgent: AgentDefinition<typeof schema> = {
  allowedTools: ["WebSearch", "WebFetch"],
  buildPrompt: (ctx) => `Research existing software similar to the user's request below, so the requirements analyst can write a better product spec.

Find 3-6 comparable products or open-source projects. For each, note what it does and its notable features. Then sum up the features they have in common, the UI patterns users expect, the pitfalls users complain about, and the scope you'd recommend for a small first version that one developer agent can build in a single pass.

If the request leaves open a choice that changes what gets built (who the users are, a key rule, what is essential versus later) and your research can't settle it, add it to questionsForCustomer: the customer may answer before the spec is written. Ask at most 4, only what matters, each with 2-4 short options and your own default; don't ask about styling or anything the request already answers. Usually none are needed.

Search costs money and time: run at most about 5 web searches and fetch at most about 5 pages. Rely on search results where they are enough. Only cite URLs you actually saw. Never invent products, features or sources; if research turns up little, say so and keep the lists short.

## User request

${ctx.userPrompt}`,
  cwd: (ctx) => ctx.stageDir,
  role: "Product Researcher",
  runtime: "doc",
  schema,
};
