import { describe, expect, test } from "bun:test";

import { renderPrd } from "./requirements.report";
import { prdSchema, type Prd } from "./requirements.schema";
import { prdForArchitecture, prdForReview, prdForTestCases, prdForUiDesign } from "./requirements.utils";
import { validatePrd } from "./requirements.validate";

// The worked example from "PRD Template v2 (Feature + Screen)": order approval.
function examplePrd(): Prd {
  return {
    assumptions: ["Нэг байгууллага, нэг валют (₮)"],
    businessRules: [
      {
        appliesTo: ["F-03", "S-05"],
        example: "6,000,000₮ → менежер батлах боломжгүй",
        id: "BRL-02",
        rule: "Захиалгын дүн 5,000,000₮-өөс их бол зөвхөн Захирал батална",
      },
      {
        appliesTo: ["F-03", "S-05"],
        example: '"Цуцлагдсан" → товч харагдахгүй',
        id: "BRL-06",
        rule: '"Батлах" товч зөвхөн "Хүлээгдэж буй" төлөвт харагдана',
      },
    ],
    constraints: [],
    decisions: [
      {
        decision: "Захирал л батална",
        id: "OQ-01",
        question: "Захирал байхгүй үед хэн 5 саяас дээш захиалга батлах вэ?",
        rationale: "MVP-д орлон гүйцэтгэгч хэрэггүй",
      },
    ],
    entities: [
      {
        description: "Захиалга",
        fields: [
          { name: "no", type: "text" },
          { name: "total", type: "money" },
          { name: "status", type: "enum" },
        ],
        id: "ENT-01",
        name: "order",
        pii: false,
        relations: [],
      },
    ],
    features: [
      {
        acceptanceCriteria: [
          {
            given: 'менежер нэвтэрсэн, дүн 3,000,000₮, төлөв "Хүлээгдэж буй"',
            id: "AC-F03-01",
            kind: "positive",
            then: 'төлөв "Батлагдсан" болно',
            when: '"Батлах" дарна',
          },
          {
            given: "менежер нэвтэрсэн, дүн 6,000,000₮",
            id: "AC-F03-02",
            kind: "negative",
            then: '"Захирлын батламж шаардлагатай" мессеж гарч, төлөв өөрчлөгдөхгүй',
            when: '"Батлах" дарна',
          },
        ],
        description: "Хүлээгдэж буй захиалгыг эрх бүхий хэрэглэгч батална",
        id: "F-03",
        name: "Захиалга батлах",
        priority: "Must",
        ruleIds: ["BRL-02", "BRL-06"],
        screenIds: ["S-05"],
        userFlow: ['S-05: "Батлах" дарна', "Систем BRL-02-оор эрхийг шалгана"],
      },
    ],
    glossary: [{ description: "", english: "Order", term: "Захиалга" }],
    nonFunctional: [{ category: "Performance", howMeasured: "curl timing", id: "NFR-01", target: "p95 ≤ 2 сек" }],
    notifications: [],
    objective: "Захиалга батлах хугацааг богиносгох",
    outOfScope: ["SMS мэдэгдэл"],
    permissions: [
      { allowed: true, featureId: "F-03", role: "Менежер", ruleId: "BRL-02" },
      { allowed: true, featureId: "F-03", role: "Захирал", ruleId: null },
    ],
    referenceSystems: [],
    reports: [],
    roles: [
      { description: "5 сая ₮ хүртэлх захиалгыг батална", name: "Менежер" },
      { description: "Бүх захиалгыг батална", name: "Захирал" },
    ],
    scope: ["Захиалга батлах"],
    screens: [
      {
        actions: [
          { featureId: "F-03", label: "Батлах", result: "S-05 шинэчлэгдэнэ", rules: "харагдах: BRL-06, эрх: BRL-02" },
          { featureId: null, label: "Буцах", result: "S-04", rules: "" },
        ],
        description: "Нэг захиалгын мэдээлэл | батлах",
        featureIds: ["F-03"],
        fields: [{ format: "1,234,567₮", name: "Нийт дүн", note: "", required: "—", source: "order.total", type: "Мөнгө" }],
        id: "S-05",
        name: "Захиалгын дэлгэрэнгүй",
        navigation: "S-04-өөс ирнэ",
        permissions: [
          { actions: ["Батлах"], canView: true, role: "Менежер" },
          { actions: ["Батлах"], canView: true, role: "Захирал" },
        ],
        roles: ["Менежер", "Захирал"],
        states: [{ display: '"Захиалга олдсонгүй"', state: "Not found" }],
      },
    ],
    title: "Захиалгын батламж",
  };
}

describe("validatePrd", () => {
  test("the template's own example is consistent", () => {
    expect(validatePrd(examplePrd())).toEqual([]);
  });

  test("the example also satisfies the structured-output schema", () => {
    expect(prdSchema.safeParse(examplePrd()).success).toBe(true);
  });

  test("flags an acceptance criterion named after the wrong feature", () => {
    const prd = examplePrd();
    prd.features[0]!.acceptanceCriteria[1]!.id = "AC-F04-02";
    expect(validatePrd(prd)).toContain("AC-F04-02: acceptance criterion of F-03 must be named AC-F03-yy");
  });

  test("flags dangling references from features, screens, actions and permissions", () => {
    const prd = examplePrd();
    prd.features[0]!.ruleIds.push("BRL-09");
    prd.screens[0]!.actions[0]!.rules = "харагдах: BRL-07";
    prd.permissions.push({ allowed: true, featureId: "F-08", role: "Нягтлан", ruleId: null });
    const issues = validatePrd(prd);
    expect(issues).toContain("F-03: references unknown business rule BRL-09");
    expect(issues).toContain('S-05 action "Батлах": references unknown business rule BRL-07');
    expect(issues).toContain("permission F-08 × Нягтлан: references unknown feature F-08");
    expect(issues).toContain("permission F-08 × Нягтлан: references unknown role Нягтлан");
  });

  test("flags malformed and duplicate ids, orphan screens and rules that apply to nothing", () => {
    const prd = examplePrd();
    prd.businessRules.push({ appliesTo: [], example: "", id: "BRL-02", rule: "dup" });
    prd.screens.push({ ...prd.screens[0]!, id: "Screen-6" });
    const issues = validatePrd(prd);
    expect(issues).toContain("BRL-02: duplicate business rule id");
    expect(issues).toContain("BRL-02: applies to nothing");
    expect(issues).toContain("Screen-6: not a valid screen id");
    expect(issues).toContain("Screen-6: no feature lists this screen");
  });

  test("flags a permission granting an action the screen doesn't have", () => {
    const prd = examplePrd();
    prd.screens[0]!.permissions[0]!.actions.push("Цуцлах");
    expect(validatePrd(prd)).toContain('S-05: role Менежер is granted unknown action "Цуцлах"');
  });
});

describe("renderPrd", () => {
  const md = renderPrd(examplePrd());

  test("keeps the template's section numbers and column names", () => {
    for (const heading of [
      "## 1. Project Overview",
      "## 3. User roles & permissions",
      "## 5. Feature detail",
      "## 7. Screen detail",
      "## 9. Business Rules",
      "## 17. Open questions & decisions",
      "## 18. Traceability matrix",
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("| Талбар | Төрөл | Заавал | Формат | Эх сурвалж | Тэмдэглэл |");
    expect(md).toContain("| Rule ID | Дүрэм | Жишээ | Хэрэглэгдэх газар |");
  });

  test("writes acceptance criteria in the template's Given/When/Then form", () => {
    expect(md).toContain("- **AC-F03-02 (negative)** — Given менежер нэвтэрсэн, дүн 6,000,000₮.");
  });

  test("builds the permission and traceability matrices from ids", () => {
    expect(md).toContain("| F-03 Захиалга батлах | ✓ (BRL-02) | ✓ |");
    expect(md).toContain("| F-03 Захиалга батлах | S-05 | AC-F03-01, AC-F03-02 | BRL-02, BRL-06 |");
  });

  test("escapes pipes so agent text can't break a table", () => {
    expect(md).toContain("Нэг захиалгын мэдээлэл \\| батлах");
  });

  test("omits optional sections that are empty, and reports consistency", () => {
    expect(md).not.toContain("## 10. Report Index");
    expect(md).not.toContain("## 12. Notifications");
    expect(md).toContain("All ids are well-formed and every reference resolves.");
  });
});

describe("PRD slices", () => {
  test("downstream agents get only their parts of the PRD", () => {
    const prd = examplePrd();
    expect(Object.keys(prdForTestCases(prd))).not.toContain("entities");
    expect(Object.keys(prdForArchitecture(prd))).not.toContain("businessRules");
    expect(Object.keys(prdForUiDesign(prd))).not.toContain("entities");
    expect(prdForArchitecture(prd).screens[0]).not.toHaveProperty("states");
    expect(Object.keys(prdForReview(prd))).not.toContain("screens");
    expect(JSON.stringify(prdForReview(prd)).length).toBeLessThan(JSON.stringify(prd).length);
  });
});
