import { z } from "zod";

import { jsonBlock, READ_TOOLS, type AgentDefinition } from "../agents.shared";
import { prdForReview, slicePrd } from "../requirements/requirements.utils";

const schema = z.object({
  acceptanceCoverage: z.array(
    z.object({ acceptanceCriterionId: z.string(), status: z.enum(["met", "partial", "missing"]) }),
  ),
  blocking: z.boolean().describe("True if any finding has severity blocker or major"),
  findings: z.array(
    z.object({
      description: z.string(),
      file: z.string(),
      id: z.string().describe("e.g. RV-1"),
      severity: z.enum(["blocker", "major", "minor"]),
      suggestion: z.string(),
    }),
  ),
});

export const reviewAgent: AgentDefinition<typeof schema> = {
  allowedTools: [...READ_TOOLS, "Bash"],
  buildPrompt: (ctx) => `${
    ctx.rereview
      ? `This is a re-review after a fix round. Read only what changed: run \`git diff ${ctx.rereview.diffRange}\`. Check that each previous blocker/major finding is resolved and that the changes introduced no new blocker/major problems. Carry forward unresolved previous findings with their ids. Acceptance coverage may be copied from the previous review except where the diff changes it.

${jsonBlock("Previous review", ctx.rereview.previousFindings)}

`
      : ""
  }Review the application in the current directory against the PRD and architecture. Do NOT modify any files; you may use Bash only for read-only commands such as git log/diff, ls, or running a linter.

Look for, in priority order:
- blocker: app will not build/start, violates the application contract (Dockerfile, $PORT, /health, single container), security holes (injection, XSS, secrets in code), data loss.
- major: an acceptance criterion missing or broken, crashes on normal input.
- minor: code quality, style, small UX issues.

${ctx.designSystem === "zt" ? "This run uses the ZT Design System: also load the factory:zt-design-system skill and check the UI code against §13 (theme via ConfigProvider, no inline colours or pixel values), §5 (one primary button per view, destructive actions confirmed, actions hidden for roles that can never use them), §9 (loading, error and no-permission states on every screen) and §11 (copy and formats). Missing required states or confirmations are major.\n\n" : ""}For UI code (HTML, CSS, client JS), load the factory:web-interface-guidelines skill with the Skill tool first, and check the code against it using the severity it defines. Read the global stylesheet in full: one global rule (for example \`overflow-wrap: anywhere\` on body, or a missing \`min-width: 0\` on flex/grid children) can break text on every screen, so treat such rules as major. Report a handful of the most important violations with file references, not every instance of the same one.

Only report real, specific problems with file references. Do not pad the list with minor nits; "blocking" must be true exactly when a blocker or major exists.

${jsonBlock("PRD (features, acceptance criteria, business rules, permissions)", slicePrd(ctx.handoffs.requirements, prdForReview))}

${jsonBlock("Architecture", ctx.handoffs.architecture)}

${jsonBlock("Developer handoff", ctx.handoffs.development)}`,
  cwd: (ctx) => ctx.workspaceDir,
  role: "Code Reviewer",
  runtime: "code",
  schema,
};
