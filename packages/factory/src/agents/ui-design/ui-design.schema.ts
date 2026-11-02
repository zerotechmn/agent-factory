import { z } from "zod";

/**
 * The UI/UX spec. Tokens become CSS custom properties the developer must use
 * everywhere, which is what keeps a generated UI visually consistent: colours
 * and type are decided once, here, not improvised per screen.
 */
export const uiDesignSchema = z.object({
  accessibility: z
    .array(z.string())
    .describe("At most 4, and only product-specific needs (e.g. a colour-coded status also needs a text label); the baseline is covered by web interface guidelines"),
  components: z
    .array(
      z.object({
        name: z.string(),
        purpose: z.string(),
        states: z.array(z.string()).describe("e.g. default, hover, focus-visible, disabled, loading, error"),
        usedOn: z.array(z.string()).describe("PRD screen ids"),
        variants: z.array(z.string()),
      }),
    )
    .describe("At most 10 reusable building blocks that every screen is assembled from; fold small variations into variants"),
  fonts: z
    .array(
      z.object({
        family: z.string(),
        fallback: z.string().describe("CSS fallback stack"),
        role: z.string().describe("e.g. display, body, numeric"),
        source: z.string().describe('"Google Fonts" with the family name, or "system"'),
      }),
    )
    .describe("At most two families"),
  responsive: z.object({
    breakpoints: z.array(z.object({ minWidth: z.number().int(), name: z.string() })),
    rules: z.array(z.string()).describe("At most 5 rules for how layouts adapt, down to a 360px-wide phone"),
  }),
  screens: z
    .array(
      z.object({
        interactions: z.array(z.string()).describe("At most 4, one line each: feedback for the screen's main actions"),
        layout: z.string().describe("One or two sentences; the wireframe carries the detail"),
        mobile: z.string().describe("One sentence: how this screen changes on a phone"),
        screenId: z.string().describe("PRD screen id, e.g. S-05"),
        states: z
          .array(z.object({ state: z.string(), treatment: z.string() }))
          .describe("One line per state the PRD screen defines; reuse component states instead of restating them"),
        wireframe: z.string().describe("ASCII wireframe of the desktop layout, at most 15 lines and 60 columns"),
      }),
    )
    .describe("One entry per PRD screen"),
  tokens: z
    .array(
      z.object({
        name: z.string().describe("CSS custom property, e.g. --color-surface, --font-display, --space-3, --radius-card"),
        usage: z.string(),
        value: z.string(),
      }),
    )
    .describe("20-28 tokens covering every colour, font, type size, spacing step, radius and shadow; a small scale, not every shade"),
  visualDirection: z.object({
    concept: z.string().describe("The idea behind the look, rooted in the product's subject"),
    rationale: z.string().describe("Why it suits this product and its users, and which generic defaults you avoided"),
  }),
});

export type UiDesign = z.infer<typeof uiDesignSchema>;
