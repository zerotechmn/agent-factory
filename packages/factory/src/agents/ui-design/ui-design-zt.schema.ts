import { z } from "zod";

/**
 * UI/UX output for runs on the ZT Design System. Tokens are fixed by the
 * system (only colorPrimary changes per project), so instead of inventing a
 * visual language the agent maps every PRD screen to a ZT template and
 * components: the `screens.json` contract of §14, minus Figma.
 */

const field = z.object({
  binding: z.string().describe("entity.field from the PRD, e.g. order.total"),
  component: z.string().describe("Ant Design component per §4, e.g. InputNumber, Descriptions.Item, Tag"),
  format: z.string().describe('e.g. "money", "date", "status", "phone", or ""'),
  label: z.string().describe("Exact label in the UI language"),
  rules: z.array(z.string()).describe("BRL ids that affect this field"),
});

const action = z.object({
  feature: z.string().nullable().describe("F-xx, or null for pure navigation"),
  kind: z.enum(["primary", "secondary", "link", "danger-confirm", "danger-modal", "icon"]).describe("Per §5"),
  label: z.string().describe("Exact button text in the UI language"),
  opens: z.string().nullable().describe("Drawer/Modal this opens, e.g. M-cancel-reason, or null"),
  operationId: z.string().nullable().describe("API operation from the architecture, or null"),
  roles: z.array(z.string()).describe("Roles that see it (hidden for others, per §5)"),
  rules: z.array(z.string()).describe("BRL ids for permission"),
  visible: z.array(z.string()).describe("BRL ids for visibility by state"),
});

export const ztUiDesignSchema = z.object({
  changeRequests: z
    .array(z.object({ reason: z.string(), screenId: z.string() }))
    .describe("PRD gaps found while designing (never filled in by inventing fields or screens)"),
  colorPrimary: z.object({
    rationale: z.string().describe("Why this colour; confirm ≥ 4.5:1 contrast on white for small text (§12)"),
    value: z.string().describe("Hex. The only per-project token change. #0958d9 when WCAG AA is required"),
  }),
  language: z.object({
    antdLocale: z.string().describe("Ant Design locale module, e.g. mn_MN or en_US"),
    code: z.string().describe("UI language, the same as the PRD's, e.g. mn or en"),
  }),
  menu: z
    .array(
      z.object({
        children: z.array(z.object({ label: z.string(), route: z.string(), screenId: z.string() })),
        label: z.string().describe("Level-1 module, ≤ 20 characters, plural noun"),
      }),
    )
    .describe("Information architecture, max 2 levels (§2, §10)"),
  mobile: z.object({
    reason: z.string(),
    required: z.boolean().describe("True only if a PRD non-functional requirement asks for mobile/tablet/responsive use"),
  }),
  newComponents: z
    .array(z.object({ need: z.string(), screenId: z.string(), usedInstead: z.string() }))
    .describe("NEW-COMPONENT? requests: needs §3–§7 don't cover, and the closest component used"),
  screens: z
    .array(
      z.object({
        actions: z.array(action),
        container: z.enum(["page", "drawer", "modal"]),
        fields: z.array(field),
        id: z.string().describe("PRD screen id, e.g. S-05"),
        name: z.string(),
        navigation: z.object({ from: z.array(z.string()), to: z.array(z.string()) }),
        roles: z.array(z.string()),
        route: z.string().describe("Route per §10, e.g. /orders/:id; drawers/modals use their parent's route"),
        states: z
          .array(z.string())
          .describe("At least loading, error, no-permission (§9), plus empty / no-results / not-found where they apply"),
        template: z.enum(["list", "detail", "form", "dashboard", "approval", "auth"]),
      }),
    )
    .describe("One entry per PRD screen, same S-ids"),
  selfCheck: z
    .array(z.object({ check: z.string(), note: z.string(), passed: z.boolean() }))
    .describe("§16, every row except the Figma one"),
});

export type ZtUiDesign = z.infer<typeof ztUiDesignSchema>;
