import { describe, expect, test } from "bun:test";

import { renderUiDesign } from "./ui-design.report";
import { uiDesignSchema, type UiDesign } from "./ui-design.schema";

const ui: UiDesign = {
  accessibility: ["Text contrast ≥ 4.5:1"],
  components: [{ name: "Button", purpose: "Primary action", states: ["default", "focus-visible"], usedOn: ["S-05"], variants: ["primary"] }],
  fonts: [{ family: "Overpass", fallback: "system-ui, sans-serif", role: "display", source: "Google Fonts" }],
  responsive: { breakpoints: [{ minWidth: 900, name: "desktop" }], rules: ["Panels stack below 900px"] },
  screens: [
    {
      interactions: ["Approve shows a toast and refreshes the status badge"],
      layout: "Details left | actions right",
      mobile: "Actions move under the details",
      screenId: "S-05",
      states: [{ state: "Not found", treatment: "Empty-state card with a link back to S-04" }],
      wireframe: "+-----------+\n| ``` nav   |\n+-----------+",
    },
  ],
  tokens: [{ name: "--color-sign", usage: "Hero panel", value: "#0F6B4E" }],
  visualDirection: { concept: "Highway signage", rationale: "Matches the travel subject" },
};

describe("renderUiDesign", () => {
  const md = renderUiDesign(ui);

  test("the fixture satisfies the structured-output schema", () => {
    expect(uiDesignSchema.safeParse(ui).success).toBe(true);
  });

  test("renders tokens, components and per-screen sections", () => {
    expect(md).toContain("| `--color-sign` | `#0F6B4E` | Hero panel |");
    expect(md).toContain("| Button | Primary action | primary | default, focus-visible | S-05 |");
    expect(md).toContain("### S-05");
    expect(md).toContain("Details left \\| actions right".replace("\\|", "|"));
  });

  test("keeps the wireframe in a code block that agent text can't close early", () => {
    expect(md).toContain("```text\n+-----------+\n| ''' nav   |");
    expect(md.match(/```/g)?.length).toBe(2);
  });
});
