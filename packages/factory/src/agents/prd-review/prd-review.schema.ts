import { z } from "zod";

/** The independent check that the PRD covers what the customer actually asked for, and nothing they didn't. */
export const prdReviewSchema = z.object({
  extras: z
    .array(z.object({ id: z.string().describe("F-xx or S-xx"), reason: z.string() }))
    .describe("Features or screens the customer didn't ask for and that aren't needed for what they asked; empty if none"),
  requests: z
    .array(
      z.object({
        coveredBy: z.array(z.string()).describe("PRD ids that cover it (F-xx, S-xx, BRL-xx), empty when missing"),
        note: z.string().describe('What is missing or different, or ""'),
        quote: z.string().describe("The customer's own words for this request, copied from the prompt"),
        status: z.enum(["covered", "partial", "missing", "out-of-scope"]).describe("out-of-scope: the PRD deliberately excluded it and says so in outOfScope or decisions"),
      }),
    )
    .describe("Every distinct thing the customer asked for: a feature, rule, role, screen, constraint or detail"),
});

export type PrdReview = z.infer<typeof prdReviewSchema>;

/**
 * Problems for the requirements agent to fix (or the report to show).
 * A deliberate, recorded exclusion is the PRD's call, not a gap.
 */
export function coverageIssues(review: PrdReview): string[] {
  return [
    ...review.requests
      .filter((r) => r.status === "missing" || r.status === "partial")
      .map((r) => `Customer asked: "${r.quote}" — ${r.status === "missing" ? "not covered by any PRD item" : `only partly covered by ${r.coveredBy.join(", ") || "the PRD"}`}${r.note ? ` (${r.note})` : ""}`),
    ...review.extras.map((e) => `${e.id} was not asked for: ${e.reason}. Move it to outOfScope unless the request needs it`),
  ];
}
