import type { UiDesign } from "./ui-design.schema";

/** Renders the UI/UX spec for people; the agent only produces the structured data. */
export function renderUiDesign(ui: UiDesign): string {
  const out: string[] = [];
  out.push("# UI/UX design", "");
  out.push("## Visual direction", "", `**${ui.visualDirection.concept}**`, "", ui.visualDirection.rationale, "");

  out.push("## Design tokens", "", "_The developer implements these as CSS custom properties and uses nothing else._", "");
  out.push(table(["Token", "Value", "Usage"], ui.tokens.map((t) => [`\`${t.name}\``, `\`${t.value}\``, t.usage])), "");

  out.push("## Fonts", "");
  out.push(table(["Role", "Family", "Fallback", "Source"], ui.fonts.map((f) => [f.role, f.family, `\`${f.fallback}\``, f.source])), "");

  out.push("## Components", "");
  out.push(
    table(
      ["Component", "Purpose", "Variants", "States", "Used on"],
      ui.components.map((c) => [c.name, c.purpose, c.variants.join(", ") || "—", c.states.join(", "), c.usedOn.join(", ")]),
    ),
    "",
  );

  out.push("## Screens", "");
  for (const s of ui.screens) {
    out.push(`### ${s.screenId}`, "", s.layout, "", "```text", s.wireframe.replace(/```/g, "'''"), "```", "");
    out.push(`**Mobile:** ${s.mobile}`, "");
    if (s.interactions.length) out.push("**Interactions**", "", list(s.interactions), "");
    if (s.states.length) out.push("**States**", "", table(["State", "Treatment"], s.states.map((st) => [st.state, st.treatment])), "");
  }

  out.push("## Responsive", "");
  out.push(table(["Breakpoint", "Min width"], ui.responsive.breakpoints.map((b) => [b.name, `${b.minWidth}px`])), "");
  out.push(list(ui.responsive.rules), "");

  out.push("## Accessibility", "", list(ui.accessibility), "");
  return out.join("\n");
}

function table(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map((c) => String(c ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>")).join(" | ")} |`;
  return [line(headers), `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(line)].join("\n");
}

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "_None._";
}
