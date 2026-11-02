import { jsonBlock, type AgentDefinition } from "../agents.shared";
import { prdForUiDesign, slicePrd } from "../requirements/requirements.utils";
import { renderUiDesign } from "./ui-design.report";
import { uiDesignSchema, type UiDesign } from "./ui-design.schema";

export const uiDesignAgent: AgentDefinition<typeof uiDesignSchema> = {
  allowedTools: [],
  buildPrompt: (ctx) => {
    const research = ctx.handoffs.research as { pitfalls?: unknown; uiPatterns?: unknown } | undefined;
    return `Design the user interface and experience for the PRD below. Follow the factory:frontend-design skill.

The PRD fixes what each screen contains: its fields, actions, states and permissions. Your job is how it looks and feels:
- A visual direction rooted in this product's subject and users, not a generic template.
- Design tokens covering every colour, font, type size, spacing step, radius and shadow. The developer will turn them into CSS custom properties in one global stylesheet and must not use any other values, so make the set complete but small.
- A component inventory the screens are built from.
- For every PRD screen (by its S-xx id): layout, an ASCII wireframe, mobile behaviour, interaction feedback for each action, and a visual treatment for each state the PRD defines (loading, empty, error, not found, no permission).
- Responsive rules down to a 360px-wide phone, and WCAG AA contrast in your token colours.

A baseline of web interface guidelines (labels, keyboard and focus, forms, motion, loading text, copy, touch) is enforced on the developer and checked in review. Don't restate it: spend your output on decisions specific to this product, and add only accessibility needs the baseline doesn't cover.

Constraints: there is no design tool, so the interface itself (icons, decoration, illustration) relies on type, colour, layout and CSS. Content imagery is different: where users would expect to see the things the product is about (for example goods, places, people or listings), design screens around real photos, with a fixed aspect ratio and a styled fallback for when an image is missing or fails to load. The fallback is the exception, not the look. Fonts must come from Google Fonts or the system. An architect is choosing the frontend stack in parallel; keep the design implementable in plain HTML and CSS.

Be concise. The developer re-reads this whole spec on every turn of a long session, so every extra line is paid for many times over, and your own output is the most expensive part of this stage. Keep the token scale small (20-28), the component list short (at most 10), and each screen entry tight; the limits in the field descriptions are hard limits.

Nobody can answer questions during the run; decide and explain in the rationale.

${jsonBlock("PRD", slicePrd(ctx.handoffs.requirements, prdForUiDesign))}${
      research
        ? `\n\n${jsonBlock("From market research: UI patterns users expect, and pitfalls they complain about", { pitfalls: research.pitfalls, uiPatterns: research.uiPatterns })}`
        : ""
    }`;
  },
  cwd: (ctx) => ctx.stageDir,
  renderReport: (handoff) => renderUiDesign(handoff as UiDesign),
  role: "UI/UX Designer",
  runtime: "doc",
  schema: uiDesignSchema,
};
