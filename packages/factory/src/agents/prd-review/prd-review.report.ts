import { coverageIssues, type PrdReview } from "./prd-review.schema";

/** Renders the coverage check for people; the agent only produces the structured data. */
export function renderPrdReview(review: PrdReview): string {
  const by = (status: string) => review.requests.filter((r) => r.status === status).length;
  const out: string[] = [];
  out.push("# PRD check — does the PRD cover what the customer asked?", "");
  out.push(
    `An independent reviewer split the customer's prompt into ${review.requests.length} requests: ${by("covered")} covered, ${by("partial")} partly covered, ${by("missing")} missing, ${by("out-of-scope")} deliberately out of scope. ${review.extras.length} PRD item(s) were not asked for.`,
    "",
  );
  out.push("| Customer asked | Status | Covered by | Note |", "| --- | --- | --- | --- |");
  for (const r of review.requests) {
    out.push(`| ${cell(r.quote)} | ${ICONS[r.status]} ${r.status} | ${r.coveredBy.join(", ") || "—"} | ${cell(r.note) || "—"} |`);
  }
  if (review.extras.length) {
    out.push("", "## Not asked for", "", ...review.extras.map((e) => `- **${e.id}** — ${e.reason}`));
  }
  const issues = coverageIssues(review);
  out.push("", issues.length ? `**${issues.length} problem(s) to fix.**` : "**The PRD covers the request.**", "");
  return out.join("\n");
}

const ICONS: Record<PrdReview["requests"][number]["status"], string> = { covered: "✓", missing: "✕", "out-of-scope": "–", partial: "◐" };

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
