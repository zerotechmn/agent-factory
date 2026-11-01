import type { Prd } from "./requirements.schema";
import { validatePrd } from "./requirements.validate";

/**
 * Renders the PRD in the layout of "PRD Template v2 (Feature + Screen)",
 * keeping its section numbers and column names so a reader can lay the two
 * side by side. Sections that don't apply to an unattended single-container
 * build are listed once at the top instead of being left empty.
 */
export function renderPrd(prd: Prd): string {
  const issues = validatePrd(prd);
  const out: string[] = [];

  out.push(`# PRD: ${prd.title}`, "");
  out.push(
    table(
      ["", ""],
      [
        ["**Objective**", prd.objective],
        ["**Status**", "GENERATED (software factory, not yet reviewed by a human)"],
        ["**Version**", "v0.1"],
      ],
    ),
  );
  out.push(
    "",
    "> Generated from the factory's structured PRD. Not applicable to automated builds, so omitted: header roles and due date, §1.2 Success metrics, §13 Integrations (apps are self-contained), §15 Deployment (handled by the factory), §16 Acceptance & Delivery, §20 Change log, §21 Sign-Off.",
    "",
  );

  out.push("# A. Бизнесийн контекст", "", "## 1. Project Overview", "");
  out.push("### 1.1 Objective", "", prd.objective, "");
  out.push("### 1.3 Scope", "", list(prd.scope), "");
  out.push("### 1.4 Out of Scope", "", list(prd.outOfScope), "");
  out.push("### 1.5 Assumptions", "", list(prd.assumptions), "");
  out.push("### 1.6 Constraints", "", list(prd.constraints), "");

  out.push("## 2. Reference systems", "");
  out.push(
    prd.referenceSystems.length
      ? table(
          ["REF ID", "Систем", "Юуг нь таалсан", "Хүсч буй функц", "Screenshot / URL"],
          prd.referenceSystems.map((r) => [r.id, r.system, r.liked, r.wantedFunction, r.url]),
        )
      : "_None._",
    "",
  );

  out.push("## 3. User roles & permissions", "");
  out.push(table(["Role", "Description"], prd.roles.map((r) => [r.name, r.description])), "");
  out.push("**Permission matrix** (Feature × Role)", "", permissionMatrix(prd), "");

  out.push("# B. Шаардлага", "", "## 4. Feature list", "");
  out.push(
    table(
      ["Feature ID", "Feature Name", "Description", "Priority", "Screens"],
      prd.features.map((f) => [f.id, f.name, f.description, f.priority, f.screenIds.join(", ")]),
    ),
    "",
  );

  out.push("## 5. Feature detail", "");
  for (const f of prd.features) {
    out.push(`### ${f.id} · ${f.name}`, "", "**Description**", "", f.description, "");
    out.push(`**Priority:** ${f.priority}`, "", "**User Flow**", "");
    out.push(f.userFlow.map((step, i) => `${i + 1}. ${step}`).join("\n"), "");
    out.push(`**Business rules:** ${f.ruleIds.join(", ") || "—"}`, "", "**Acceptance Criteria**", "");
    out.push(
      f.acceptanceCriteria
        .map(
          (ac) =>
            `- **${ac.id}${ac.kind === "negative" ? " (negative)" : ""}** — Given ${ac.given}. When ${ac.when}. Then ${ac.then}.`,
        )
        .join("\n"),
      "",
    );
  }

  out.push("## 6. Screen index", "");
  out.push(
    table(
      ["Screen ID", "Screen Name", "Roles", "Features", "Description"],
      prd.screens.map((s) => [s.id, s.name, s.roles.join(", "), s.featureIds.join(", "), s.description]),
    ),
    "",
  );

  out.push("## 7. Screen detail", "");
  for (const s of prd.screens) {
    out.push(`### ${s.id} · ${s.name}`, "", `**Linked features:** ${s.featureIds.join(", ") || "—"}`, "");
    out.push("**Fields**", "");
    out.push(
      s.fields.length
        ? table(
            ["Талбар", "Төрөл", "Заавал", "Формат", "Эх сурвалж", "Тэмдэглэл"],
            s.fields.map((f) => [f.name, f.type, f.required, f.format, f.source, f.note]),
          )
        : "_No fields._",
      "",
    );
    out.push("**Actions**", "");
    out.push(
      s.actions.length
        ? table(
            ["Үйлдэл", "Feature", "Дүрэм", "Үр дүн / дараагийн дэлгэц"],
            s.actions.map((a) => [a.label, a.featureId ?? "—", a.rules || "—", a.result]),
          )
        : "_No actions._",
      "",
    );
    out.push("**States**", "");
    out.push(table(["Төлөв", "Харагдах байдал / мессеж"], s.states.map((st) => [st.state, st.display])), "");
    out.push("**Permissions**", "");
    const actionLabels = s.actions.filter((a) => a.featureId).map((a) => a.label);
    out.push(
      table(
        ["Role", "Харах", ...actionLabels],
        s.permissions.map((p) => [p.role, tick(p.canView), ...actionLabels.map((label) => tick(p.actions.includes(label)))]),
      ),
      "",
    );
    out.push(`**Navigation:** ${s.navigation}`, "");
  }

  out.push("## 8. Data Entities", "");
  out.push(
    table(
      ["Entity", "Key fields (type)", "Relations", "PII", "Description"],
      prd.entities.map((e) => [
        `${e.id} ${e.name}`,
        e.fields.map((f) => `${f.name} (${f.type})`).join(", "),
        e.relations.join("; ") || "—",
        e.pii ? "Тийм" : "Үгүй",
        e.description,
      ]),
    ),
    "",
  );

  out.push("## 9. Business Rules", "");
  out.push(
    prd.businessRules.length
      ? table(
          ["Rule ID", "Дүрэм", "Жишээ", "Хэрэглэгдэх газар"],
          prd.businessRules.map((r) => [r.id, r.rule, r.example, r.appliesTo.join(", ")]),
        )
      : "_None._",
    "",
  );

  if (prd.reports.length) {
    out.push("## 10. Report Index", "");
    out.push(
      table(["Report ID", "Report Name", "Purpose", "Roles"], prd.reports.map((r) => [r.id, r.name, r.purpose, r.roles.join(", ")])),
      "",
    );
    out.push("## 11. Report Definition", "");
    for (const r of prd.reports) {
      out.push(`### ${r.id} · ${r.name}`, "", `**Fields:** ${r.fields.join(", ")}`, "", `**Filters:** ${r.filters.join(", ") || "—"}`, "");
    }
  }

  if (prd.notifications.length) {
    out.push("## 12. Notifications", "");
    out.push(
      table(
        ["ID", "Trigger", "Channel", "Recipient", "Template"],
        prd.notifications.map((n) => [n.id, n.trigger, "In-app", n.recipient, n.template]),
      ),
      "",
    );
  }

  out.push("## 14. Non-Functional Requirements", "");
  out.push(
    prd.nonFunctional.length
      ? table(["ID", "Category", "Target", "How measured"], prd.nonFunctional.map((n) => [n.id, n.category, n.target, n.howMeasured]))
      : "_None._",
    "",
  );

  out.push("# C. Хүлээлгэн өгөх", "", "## 17. Open questions & decisions", "");
  out.push(
    prd.decisions.length
      ? table(["OQ ID", "Асуулт", "Хариулт / шийдвэр", "Үндэслэл"], prd.decisions.map((d) => [d.id, d.question, d.decision, d.rationale]))
      : "_None._",
    "",
  );
  out.push("_Decided by the requirements agent during the run; review before relying on them._", "");

  out.push("## 18. Traceability matrix", "", "_Built by the factory from the ids above._", "");
  out.push(
    table(
      ["Feature", "Screens", "AC", "Rules"],
      prd.features.map((f) => [
        `${f.id} ${f.name}`,
        f.screenIds.join(", ") || "—",
        f.acceptanceCriteria.map((ac) => ac.id).join(", "),
        f.ruleIds.join(", ") || "—",
      ]),
    ),
    "",
  );

  if (prd.glossary.length) {
    out.push("## 19. Glossary", "");
    out.push(table(["Монгол", "English", "Тайлбар"], prd.glossary.map((g) => [g.term, g.english, g.description])), "");
  }

  out.push("## Consistency check", "");
  out.push(
    issues.length
      ? `The factory found ${issues.length} cross-reference problem(s):\n\n${list(issues)}`
      : "All ids are well-formed and every reference resolves.",
    "",
  );

  return out.join("\n");
}

function permissionMatrix(prd: Prd): string {
  const roles = prd.roles.map((r) => r.name);
  return table(
    ["Feature", ...roles],
    prd.features.map((f) => [
      `${f.id} ${f.name}`,
      ...roles.map((role) => {
        const entry = prd.permissions.find((p) => p.featureId === f.id && p.role === role);
        if (!entry?.allowed) return "—";
        return entry.ruleId ? `✓ (${entry.ruleId})` : "✓";
      }),
    ]),
  );
}

function table(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map(cell).join(" | ")} |`;
  return [line(headers), `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map(line)].join("\n");
}

function cell(value: string): string {
  // A raw pipe or newline would break the table row.
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function list(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "_None._";
}

function tick(on: boolean): string {
  return on ? "✓" : "—";
}
