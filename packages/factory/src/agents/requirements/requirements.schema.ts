import { z } from "zod";

/**
 * The PRD, following "PRD Template v2 (Feature + Screen)". The agent fills
 * this structure only; requirements.report.ts renders it in the template's
 * layout, so the model never spends output tokens on Markdown formatting.
 *
 * Sections that need a human process (driver/approver, due date, success
 * metrics, deployment, UAT, warranty, change log, sign-off) and real
 * external integrations are left out: the factory builds one self-contained
 * app unattended. Logic lives in features and business rules; screens only
 * reference them by id, exactly as the template prescribes.
 */

const ids = (what: string) => z.array(z.string()).describe(`${what} ids`);

const acceptanceCriterion = z.object({
  given: z.string(),
  id: z.string().describe("AC-Fxx-yy, where Fxx is this feature's id, e.g. AC-F03-02"),
  kind: z.enum(["positive", "negative"]),
  then: z.string(),
  when: z.string(),
});

const feature = z.object({
  acceptanceCriteria: z.array(acceptanceCriterion).min(1).describe("Include negative cases for every business rule the feature uses"),
  description: z.string(),
  id: z.string().describe("F-xx, e.g. F-03"),
  name: z.string(),
  priority: z.enum(["Must", "Should", "Could"]),
  ruleIds: ids("BRL-xx business rule"),
  screenIds: ids("S-xx screen"),
  userFlow: z.array(z.string()).describe("Numbered steps; name screens by id, e.g. 'S-04: user selects an order'"),
});

const screen = z.object({
  actions: z.array(
    z.object({
      featureId: z.string().nullable().describe("F-xx, or null for pure navigation such as Back"),
      label: z.string().describe('Button or link text, e.g. "Approve"'),
      result: z.string().describe("Outcome or next screen"),
      rules: z.string().describe('Visibility/permission rule refs, e.g. "visible: BRL-06, permission: BRL-02", or ""'),
    }),
  ),
  description: z.string(),
  featureIds: ids("F-xx feature"),
  fields: z.array(
    z.object({
      format: z.string().describe('e.g. "YYYY-MM-DD", "10-500 chars", "read-only"'),
      name: z.string(),
      note: z.string().describe('e.g. "calculated: BRL-05", or ""'),
      required: z.string().describe('"Yes", "No", or a condition such as "Yes (when cancelling)"'),
      source: z.string().describe("entity.field, e.g. order.created_at"),
      type: z.string(),
    }),
  ),
  id: z.string().describe("S-xx, e.g. S-05"),
  name: z.string(),
  navigation: z.string().describe("Where users come from and go to, by screen id"),
  permissions: z.array(
    z.object({ actions: z.array(z.string()).describe("Action labels this role may use"), canView: z.boolean(), role: z.string() }),
  ),
  roles: z.array(z.string()).describe("Role names that can open this screen"),
  states: z
    .array(z.object({ display: z.string().describe("What the user sees, including exact message text"), state: z.string() }))
    .describe("At least Loading, Empty (for lists), Error and Not found where relevant"),
});

export const prdSchema = z.object({
  assumptions: z.array(z.string()).describe("§1.5 Technical and business assumptions"),
  businessRules: z
    .array(
      z.object({
        appliesTo: z.array(z.string()).describe("Feature, screen or report ids"),
        example: z.string().describe("A concrete worked example with values"),
        id: z.string().describe("BRL-xx"),
        rule: z.string().describe("Condition → outcome"),
      }),
    )
    .describe("§9 All conditional logic, calculations and visibility rules"),
  constraints: z.array(z.string()).describe("§1.6"),
  decisions: z
    .array(
      z.object({
        decision: z.string(),
        id: z.string().describe("OQ-xx"),
        question: z.string(),
        rationale: z.string(),
      }),
    )
    .describe("§17 Open questions. Nobody can answer them during the run, so decide each one yourself and record why"),
  entities: z
    .array(
      z.object({
        description: z.string(),
        fields: z.array(z.object({ name: z.string(), type: z.string() })),
        id: z.string().describe("ENT-xx"),
        name: z.string(),
        pii: z.boolean(),
        relations: z.array(z.string()).describe('e.g. "customer 1-N order"'),
      }),
    )
    .describe("§8"),
  features: z.array(feature).min(1).describe("§4-5"),
  glossary: z.array(z.object({ description: z.string(), english: z.string(), term: z.string() })).describe("§19"),
  nonFunctional: z
    .array(z.object({ category: z.string(), howMeasured: z.string(), id: z.string().describe("NFR-xx"), target: z.string() }))
    .describe("§14 Only targets that can be checked in a single container; every target has a number or a clear yes/no"),
  notifications: z
    .array(
      z.object({
        id: z.string().describe("N-xx"),
        recipient: z.string(),
        template: z.string(),
        trigger: z.string(),
      }),
    )
    .describe("§12 In-app notifications only; external email/SMS is out of scope"),
  objective: z.string().describe("§1.1 Business objective in 1-2 sentences"),
  outOfScope: z.array(z.string()).describe("§1.4"),
  permissions: z
    .array(
      z.object({
        allowed: z.boolean(),
        featureId: z.string(),
        role: z.string(),
        ruleId: z.string().nullable().describe("BRL-xx when access is conditional"),
      }),
    )
    .describe("§3 Permission matrix, one entry per feature × role"),
  referenceSystems: z
    .array(
      z.object({
        id: z.string().describe("REF-xx"),
        liked: z.string(),
        system: z.string(),
        url: z.string(),
        wantedFunction: z.string(),
      }),
    )
    .describe("§2 Comparable systems, taken from the research when available"),
  reports: z
    .array(
      z.object({
        fields: z.array(z.string()),
        filters: z.array(z.string()),
        id: z.string().describe("R-xx"),
        name: z.string(),
        purpose: z.string(),
        roles: z.array(z.string()),
      }),
    )
    .describe("§10-11 Only if the user asked for reports; otherwise empty"),
  roles: z.array(z.object({ description: z.string(), name: z.string() })).min(1).describe("§3"),
  scope: z.array(z.string()).describe("§1.3"),
  screens: z.array(screen).min(1).describe("§6-7"),
  title: z.string().describe("Short product name"),
});

export type Prd = z.infer<typeof prdSchema>;
