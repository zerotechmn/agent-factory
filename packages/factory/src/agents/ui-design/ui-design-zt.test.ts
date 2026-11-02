import { describe, expect, test } from "bun:test";

import { createRunSchema } from "../../runs/runs.dto";
import { skillsFor, STAGE_SETTINGS } from "../../pipeline/pipeline.constants";
import { shouldCheckMobile } from "../../pipeline/pipeline.ui-check";
import { agentFor } from "../agents.registry";
import { renderZtUiDesign } from "./ui-design-zt.report";
import { ztUiDesignSchema, type ZtUiDesign } from "./ui-design-zt.schema";

// The ZT Design System's own §14 example, as the UI/UX agent would emit it.
const spec: ZtUiDesign = {
  changeRequests: [],
  colorPrimary: { rationale: "Default; 4.1:1, so links use #0958d9 for small text", value: "#1677ff" },
  language: { antdLocale: "mn_MN", code: "mn" },
  menu: [{ children: [{ label: "Захиалгууд", route: "/orders", screenId: "S-04" }], label: "Захиалга" }],
  mobile: { reason: "No mobile NFR in the PRD", required: false },
  newComponents: [],
  screens: [
    {
      actions: [
        {
          feature: "F-03",
          kind: "primary",
          label: "Батлах",
          opens: null,
          operationId: "approveOrder",
          roles: ["Менежер", "Захирал"],
          rules: ["BRL-02"],
          visible: ["BRL-06"],
        },
      ],
      container: "page",
      fields: [{ binding: "order.total", component: "Descriptions.Item", format: "money", label: "Нийт дүн", rules: ["BRL-05"] }],
      id: "S-05",
      name: "Захиалгын дэлгэрэнгүй",
      navigation: { from: ["S-04"], to: ["S-04"] },
      roles: ["Менежер", "Захирал", "Нягтлан"],
      route: "/orders/:id",
      states: ["loading", "error", "not-found", "no-permission"],
      template: "detail",
    },
  ],
  selfCheck: [{ check: "loading, error, no-permission on every screen", note: "", passed: true }],
};

describe("ZT UI/UX design", () => {
  test("the §14 example satisfies the structured-output schema", () => {
    expect(ztUiDesignSchema.safeParse(spec).success).toBe(true);
  });

  test("renders template, route, bindings and operation ids", () => {
    const md = renderZtUiDesign(spec);
    expect(md).toContain("| S-05 Захиалгын дэлгэрэнгүй | detail | page | `/orders/:id` |");
    expect(md).toContain("| Нийт дүн | `order.total` | Descriptions.Item | money | BRL-05 |");
    expect(md).toContain("`approveOrder`");
    expect(md).not.toContain("NEW-COMPONENT? requests");
  });
});

describe("design system selection", () => {
  test("ZT is the default for new runs", () => {
    expect(createRunSchema.parse({ prompt: "A tiny notes app with tags" }).designSystem).toBe("zt");
    expect(createRunSchema.safeParse({ designSystem: "material", prompt: "A tiny notes app" }).success).toBe(false);
  });

  test("the UI/UX agent differs by design system; other stages don't", () => {
    expect(agentFor("uiDesign", "zt")).not.toBe(agentFor("uiDesign", "custom"));
    expect(agentFor("architecture", "zt")).toBe(agentFor("architecture", "custom"));
  });

  test("ZT replaces frontend-design and adds itself to review; custom is untouched", () => {
    const dev = STAGE_SETTINGS.development.skills;
    expect(skillsFor("development", "zt", dev)).toContain("factory:zt-design-system");
    expect(skillsFor("development", "zt", dev)).not.toContain("factory:frontend-design");
    expect(skillsFor("review", "zt", STAGE_SETTINGS.review.skills)).toContain("factory:zt-design-system");
    expect(skillsFor("development", "custom", dev)).toEqual(dev);
  });
});

describe("shouldCheckMobile", () => {
  test("custom designs are always checked at phone width", () => {
    expect(shouldCheckMobile({ designSystem: "custom", prd: null, uiDesign: null })).toBe(true);
  });

  test("ZT follows the UI design's decision, else the PRD's non-functional requirements", () => {
    expect(shouldCheckMobile({ designSystem: "zt", prd: null, uiDesign: { mobile: { required: false } } })).toBe(false);
    expect(shouldCheckMobile({ designSystem: "zt", prd: null, uiDesign: { mobile: { required: true } } })).toBe(true);
    const prd = (target: string) => ({ nonFunctional: [{ category: "Usability", target }] });
    expect(shouldCheckMobile({ designSystem: "zt", prd: prd("Works on a phone at 375px"), uiDesign: null })).toBe(true);
    expect(shouldCheckMobile({ designSystem: "zt", prd: prd("Гар утсан дээр ажиллана"), uiDesign: null })).toBe(true);
    expect(shouldCheckMobile({ designSystem: "zt", prd: prd("Page load p95 ≤ 2 s"), uiDesign: null })).toBe(false);
  });
});
