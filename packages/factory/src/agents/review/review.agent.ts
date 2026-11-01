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
  }Review the application in the current directory against the requirements and design. Do NOT modify any files; you may use Bash only for read-only commands such as git log/diff, ls, or running a linter.

Look for, in priority order:
- blocker: app will not build/start, violates the application contract (Dockerfile, $PORT, /health, single container), security holes (injection, XSS, secrets in code), data loss.
- major: an acceptance criterion missing or broken, crashes on normal input.
- minor: code quality, style, small UX issues.

Only report real, specific problems with file references. Do not pad the list with minor nits; "blocking" must be true exactly when a blocker or major exists.

${jsonBlock("PRD (features, acceptance criteria, business rules, permissions)", slicePrd(ctx.handoffs.requirements, prdForReview))}

${jsonBlock("Design", ctx.handoffs.design)}

${jsonBlock("Developer handoff", ctx.handoffs.development)}`,
  cwd: (ctx) => ctx.workspaceDir,
  role: "Code Reviewer",
  runtime: "code",
  schema,
};
