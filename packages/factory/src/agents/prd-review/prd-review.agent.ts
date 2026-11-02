import { asPrd } from "../requirements/requirements.utils";
import { jsonBlock, type AgentDefinition, type StageContext } from "../agents.shared";
import { renderPrdReview } from "./prd-review.report";
import { prdReviewSchema, type PrdReview } from "./prd-review.schema";

/**
 * A second pair of eyes on the spec before ~$4.50 of design and development is
 * spent on it. Everything downstream checks the app against the PRD; this is
 * the only check of the PRD against what the customer actually wrote.
 * Sonnet, low effort: a careful comparison, not design.
 */
export const prdReviewAgent: AgentDefinition<typeof prdReviewSchema> = {
  allowedTools: [],
  buildPrompt: (ctx) => `Check whether the PRD below covers what the customer asked for.

1. Split the customer's request into every distinct thing they asked for: each feature, rule or calculation, role, screen, constraint and specific detail (a number, a status name, a filter). Quote their own words for each, in their language.
2. For each, find the PRD items that deliver it (features, screens, business rules) and mark it:
   - covered: fully delivered, including the specifics they gave;
   - partial: delivered, but a detail they gave is missing or different (say which in note);
   - missing: nothing in the PRD delivers it;
   - out-of-scope: the PRD deliberately excludes it and records that in outOfScope or decisions (the PRD may cut scope; that is not a gap).
3. List as extras only features or screens the customer didn't ask for and that aren't needed for what they asked. Things any such app needs (signing in to act as a role, basic create/list/edit for what they mentioned, an error state) are not extras.

Judge by meaning, not wording. Don't invent requests the customer didn't make, and don't judge quality or design.

## Customer's request

${ctx.userPrompt}

${jsonBlock("PRD (what it delivers)", summary(ctx))}`,
  cwd: (ctx) => ctx.stageDir,
  renderReport: (handoff) => renderPrdReview(handoff as PrdReview),
  role: "PRD Reviewer",
  runtime: "doc",
  schema: prdReviewSchema,
};

/** What the PRD delivers, without the template detail a coverage check doesn't need. */
function summary(ctx: StageContext) {
  const prd = asPrd(ctx.handoffs.requirements);
  if (!prd) return ctx.handoffs.requirements;
  return {
    businessRules: prd.businessRules.map((r) => ({ id: r.id, rule: r.rule })),
    decisions: prd.decisions.map((d) => ({ decision: d.decision, question: d.question })),
    features: prd.features.map((f) => ({
      acceptanceCriteria: f.acceptanceCriteria.map((ac) => `${ac.when} → ${ac.then}`),
      description: f.description,
      id: f.id,
      name: f.name,
    })),
    outOfScope: prd.outOfScope,
    reports: prd.reports.map((r) => ({ id: r.id, name: r.name })),
    roles: prd.roles.map((r) => r.name),
    screens: prd.screens.map((s) => ({ id: s.id, name: s.name })),
  };
}
