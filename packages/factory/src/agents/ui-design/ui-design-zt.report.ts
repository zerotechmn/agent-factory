import type { ZtUiDesign } from "./ui-design-zt.schema";

/** Renders the ZT screen spec for people; the agent only produces the structured data. */
export function renderZtUiDesign(ui: ZtUiDesign): string {
  const out: string[] = [];
  out.push("# UI/UX design — ZT Design System (Ant Design 6)", "");
  out.push(
    table(
      ["", ""],
      [
        ["**colorPrimary**", `\`${ui.colorPrimary.value}\` — ${ui.colorPrimary.rationale}`],
        ["**Language**", `${ui.language.code} (Ant Design locale \`${ui.language.antdLocale}\`)`],
        ["**Mobile**", `${ui.mobile.required ? "Required" : "Desktop-first"} — ${ui.mobile.reason}`],
      ],
    ),
    "",
  );

  out.push("## Menu", "");
  out.push(
    ui.menu
      .map((m) => `- **${m.label}**\n${m.children.map((c) => `  - ${c.label} — \`${c.route}\` (${c.screenId})`).join("\n")}`)
      .join("\n"),
    "",
  );

  out.push("## Screens", "");
  out.push(
    table(
      ["Screen", "Template", "Container", "Route", "Roles", "States"],
      ui.screens.map((s) => [`${s.id} ${s.name}`, s.template, s.container, `\`${s.route}\``, s.roles.join(", "), s.states.join(", ")]),
    ),
    "",
  );
  for (const s of ui.screens) {
    out.push(`### ${s.id} · ${s.name}`, "", `\`${s.template}\` · ${s.container} · \`${s.route}\``, "");
    if (s.fields.length) {
      out.push(
        table(
          ["Label", "Binding", "Component", "Format", "Rules"],
          s.fields.map((f) => [f.label, `\`${f.binding}\``, f.component, f.format || "—", f.rules.join(", ") || "—"]),
        ),
        "",
      );
    }
    if (s.actions.length) {
      out.push(
        table(
          ["Action", "Kind", "Feature", "operationId", "Visible", "Roles", "Opens"],
          s.actions.map((a) => [
            a.label,
            a.kind,
            a.feature ?? "—",
            a.operationId ? `\`${a.operationId}\`` : "—",
            a.visible.join(", ") || "—",
            a.roles.join(", ") || "all",
            a.opens ?? "—",
          ]),
        ),
        "",
      );
    }
    out.push(`**Navigation:** from ${s.navigation.from.join(", ") || "—"} → to ${s.navigation.to.join(", ") || "—"}`, "");
  }

  if (ui.newComponents.length) {
    out.push("## NEW-COMPONENT? requests", "");
    out.push(table(["Screen", "Need", "Used instead"], ui.newComponents.map((n) => [n.screenId, n.need, n.usedInstead])), "");
  }
  if (ui.changeRequests.length) {
    out.push("## Change requests (PRD gaps)", "");
    out.push(table(["Screen", "Reason"], ui.changeRequests.map((c) => [c.screenId, c.reason])), "");
  }

  out.push("## Self-check (§16)", "");
  out.push(table(["Check", "Result", "Note"], ui.selfCheck.map((c) => [c.check, c.passed ? "✓" : "✕", c.note || "—"])), "");
  return out.join("\n");
}

function table(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map((c) => String(c ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>")).join(" | ")} |`;
  return [line(headers), `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(line)].join("\n");
}
