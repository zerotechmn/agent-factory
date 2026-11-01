import { jsonBlock, type AgentDefinition, type StageContext } from "../agents.shared";
import { renderPrd } from "./requirements.report";
import { prdSchema, type Prd } from "./requirements.schema";

export const requirementsAgent: AgentDefinition<typeof prdSchema> = {
  allowedTools: [],
  buildPrompt: (ctx) => (ctx.repairIssues ? repairPrompt(ctx) : writePrompt(ctx)),
  cwd: (ctx) => ctx.stageDir,
  renderReport: (prd) => renderPrd(prd as Prd),
  role: "Requirements Analyst",
  runtime: "doc",
  schema: prdSchema,
};

function writePrompt(ctx: StageContext): string {
  return `Write the PRD (product requirements document) for the user's request below, as the structured output.

The PRD follows a Feature + Screen template. Its rules:
- Requirements, acceptance criteria and business rules live in features and businessRules. Screens only reference them by id and define fields, actions, states and permissions.
- No logic on screens. Any "if …" condition (visibility by state, conditional permission, validation that depends on other data, calculated values) is a business rule (BRL-xx) with a worked example, and the screen points to it, e.g. "visible: BRL-06" or "calculated: BRL-05".
- Ids: F-xx features, AC-Fxx-yy acceptance criteria (Fxx = the owning feature), BRL-xx rules, S-xx screens, ENT-xx entities, NFR-xx, N-xx, R-xx, REF-xx, OQ-xx, numbered from 01. Every reference must point to an id that exists.
- Acceptance criteria are Given/When/Then with concrete values, observable through the app's UI or HTTP API. Each business rule a feature uses needs at least one negative criterion.
- Screen states give the exact message text users see (loading, empty, error, not found, no permission as relevant).
- Every feature × role pair appears in permissions.

Scope it to what one developer agent can build and test in one sitting: a focused MVP, typically 3-6 features and the screens they need. Prefer cutting scope (record it in outOfScope) over vague requirements. The app is one self-contained container: no external email/SMS, payment or third-party APIs (use in-app notifications or record them as out of scope).

You cannot ask questions. Put each open question in decisions with the decision you took and why.

Write the content in the language of the user's request. Keep ids and enum values exactly as specified.

${ctx.handoffs.research ? "Market research on similar products is attached. Use it to fill gaps the user left open (expected features, sensible defaults, known pitfalls), to inform the MVP cut, and for referenceSystems. The user's request always wins where they conflict; record requirements taken from the research in assumptions." : "No market research is available for this run; rely on the request and common sense. referenceSystems may be empty."}

## User request

${ctx.userPrompt}${ctx.handoffs.research ? `\n\n${jsonBlock("Research on similar products", ctx.handoffs.research)}` : ""}`;
}

function repairPrompt(ctx: StageContext): string {
  const issues = jsonBlock("Consistency problems found by the factory", ctx.repairIssues);
  if (ctx.resumed) {
    return `The factory checked your PRD's ids and cross-references and found the problems below. Return the complete corrected PRD, changing only what is needed to fix them.

${issues}`;
  }
  return `${writePrompt(ctx)}

## Correction

A previous version of this PRD (below) had the consistency problems listed. Return the complete corrected PRD, changing only what is needed to fix them.

${issues}

${jsonBlock("Previous PRD", ctx.handoffs.requirements)}`;
}
