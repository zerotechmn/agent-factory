import { jsonBlock, type AgentDefinition } from "../agents.shared";
import { prdForUiDesign, slicePrd } from "../requirements/requirements.utils";
import { renderZtUiDesign } from "./ui-design-zt.report";
import { ztUiDesignSchema, type ZtUiDesign } from "./ui-design-zt.schema";

/** UI/UX design for runs on the ZT Design System; see ui-design.agent.ts for the custom-design variant. */
export const ztUiDesignAgent: AgentDefinition<typeof ztUiDesignSchema> = {
  allowedTools: [],
  buildPrompt: (ctx) => `Design the screens for the PRD below with the ZT Design System. Load the factory:zt-design-system skill with the Skill tool first: it is the only design reference for this run. Read its "Factory overrides" section, then follow its §0 procedure (steps 1–8 and 10; there is no Figma).

- Use only its tokens and components. The one token you choose is colorPrimary (keep #1677ff unless the product needs a brand colour; check contrast per §12).
- Map every PRD screen to exactly one template (§3), its fields to components (§4) and its actions to buttons (§5), and include every state it needs (§9). Reference BRL, feature and role ids; write no logic.
- Never add a field, action or screen the PRD lacks. Record gaps in changeRequests and needs the system doesn't cover in newComponents, then carry on.
- Labels and button texts are in the PRD's language (override 2); in Mongolian, follow §11 exactly.
- Set mobile.required only if a PRD non-functional requirement asks for mobile, tablet or responsive use.
- Routes follow §10 (e.g. /orders, /orders/:id). An architect is defining the API in parallel; give operationId as a camelCase verb + noun (e.g. approveOrder) for every action that calls the server.

Be concise: the developer re-reads this spec on every turn.

${jsonBlock("PRD", slicePrd(ctx.handoffs.requirements, prdForUiDesign))}`,
  cwd: (ctx) => ctx.stageDir,
  renderReport: (handoff) => renderZtUiDesign(handoff as ZtUiDesign),
  role: "UI/UX Designer",
  runtime: "doc",
  schema: ztUiDesignSchema,
};
