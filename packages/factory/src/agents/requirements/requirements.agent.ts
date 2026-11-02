import { jsonBlock, type AgentDefinition, type StageContext } from "../agents.shared";
import { renderPrd } from "./requirements.report";
import { prdSchema, type Prd } from "./requirements.schema";

export const requirementsAgent: AgentDefinition<typeof prdSchema> = {
  allowedTools: [],
  buildPrompt: (ctx) => (ctx.repairIssues ? repairPrompt(ctx) : ctx.revision ? revisePrompt(ctx) : writePrompt(ctx)),
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

You cannot ask questions while writing. Put each open question in decisions with the decision you took and why. For the few that the customer could reasonably want to decide themselves (scope, a rule, who may do what), set askCustomer with 2-4 short options, your decision among them: the customer may review those after you finish. At most 5; most decisions don't need it.

Write the content in the language of the user's request. Keep ids and enum values exactly as specified.

${ctx.handoffs.research ? "Market research on similar products is attached. Use it to fill gaps the user left open (expected features, sensible defaults, known pitfalls), to inform the MVP cut, and for referenceSystems. The user's request always wins where they conflict; record requirements taken from the research in assumptions." : "No market research is available for this run; rely on the request and common sense. referenceSystems may be empty."}

## User request

${ctx.userPrompt}${ctx.customerInput ? `\n\n${ctx.customerInput}` : ""}${ctx.handoffs.research ? `\n\n${jsonBlock("Research on similar products", ctx.handoffs.research)}` : ""}`;
}

function repairPrompt(ctx: StageContext): string {
  const issues = `${ctx.repairIssues?.length ? jsonBlock("Problems found by the factory's PRD checks", ctx.repairIssues) : ""}${
    ctx.customerInput ? `\n\n${ctx.customerInput}\n\nThe customer's choices win over yours: update each affected decision (start its rationale with "Customer:"), and everything that depends on it (features, rules, screens, permissions).` : ""
  }`;
  if (ctx.resumed) {
    return `The factory checked your PRD (ids and cross-references, testability, scope, and coverage of the user's request) and found the problems below. Return the complete corrected PRD, changing only what is needed to fix them. Where a problem says the user asked for something the PRD lacks, add it; where it says something wasn't asked for, move it to outOfScope unless the request needs it.

${issues}`;
  }
  return `${ctx.revision ? revisePrompt(ctx) : writePrompt(ctx)}

## Correction

A previous version of this PRD (below) had the problems listed. Return the complete corrected PRD, changing only what is needed to fix them.

${issues}

${jsonBlock("Previous PRD", ctx.handoffs.requirements)}`;
}

/**
 * A deployed app's PRD, updated from the customer's feedback. Stable ids keep
 * every later stage's revision small: unchanged items must stay identical.
 */
function revisePrompt(ctx: StageContext): string {
  return `The app below was built from this PRD and is live. The customer used it and gave feedback. Return the complete updated PRD as the structured output.

- Change only what the feedback needs. Keep every other feature, rule, screen, entity and id exactly as it is (same ids, same wording), so the factory can see precisely what changed.
- New items get new ids that continue the numbering. Something the customer wants removed moves to outOfScope (and its references are cleaned up).
- All the PRD rules still apply: logic in features and business rules, acceptance criteria in Given/When/Then with concrete values (positive and negative), states with exact messages, permissions per feature × role.
- Record anything you had to decide in decisions (askCustomer for choices the customer should make).

Write in the language of the existing PRD.

## Customer feedback on the live app

${ctx.revision?.feedback ?? ""}

${jsonBlock("Current PRD", ctx.handoffs.requirements)}`;
}
