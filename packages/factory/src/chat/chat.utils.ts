import type Anthropic from "@anthropic-ai/sdk";

import type { getRunDetail } from "../runs/runs.service";
import { CHAT_FALLBACK_PRICE, CHAT_MAX_REPORT_CHARS, CHAT_PRICES } from "./chat.constants";
import { textOf, type ChatUIMessage } from "./chat.dto";

type RunDetail = ReturnType<typeof getRunDetail>;

/**
 * The UI conversation as API messages: text only. An assistant turn stopped
 * before it wrote anything is dropped, and so is anything before the first
 * user turn, which the API requires to come first.
 */
export function toApiMessages(messages: ChatUIMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const turns = messages.map((m) => ({ content: textOf(m).trim(), role: m.role })).filter((m) => m.content.length > 0);
  const first = turns.findIndex((m) => m.role === "user");
  return first === -1 ? [] : turns.slice(first);
}

/** Everything the model may answer from, as one block that stays the same across a conversation's turns. */
export function buildRunRecord(run: RunDetail, reports: { dirName: string; markdown: string | null }[]): string {
  const stages = run.stages
    .map((s) => `- ${s.label} (${s.dirName}): ${s.status}, $${s.costUsd.toFixed(2)}${s.error ? `. Error: ${s.error}` : ""}`)
    .join("\n");
  const revisions = run.revisions.map((r) => `- Round ${r.n} (${r.status}): ${r.feedback}${r.note ? ` Note: ${r.note}` : ""}`).join("\n");

  let budget = CHAT_MAX_REPORT_CHARS;
  const reportBlocks = reports.map(({ dirName, markdown }) => {
    const label = run.stages.find((s) => s.dirName === dirName)?.label ?? dirName;
    if (markdown === null) return `<stage_report stage="${label}">No report written.</stage_report>`;
    const kept = markdown.slice(0, Math.max(budget, 0));
    budget -= kept.length;
    const cut = kept.length < markdown.length ? "\n[Report cut here: the record's size limit was reached.]" : "";
    return `<stage_report stage="${label}">\n${kept}${cut}\n</stage_report>`;
  });

  return [
    "<run_record>",
    `<request>\n${run.prompt}\n</request>`,
    `Status: ${run.status}${run.stopReason ? ` (${run.stopReason})` : ""}`,
    `App URL: ${run.appUrl ?? "not deployed yet"}`,
    `Spent: $${run.costUsd.toFixed(2)} of a $${run.budgetUsd.toFixed(2)} budget`,
    `Stages:\n${stages || "- none yet"}`,
    revisions ? `Feedback rounds:\n${revisions}` : "",
    ...reportBlocks,
    "</run_record>",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function costUsd(model: string, usage: Partial<Anthropic.Beta.BetaUsage> | null): number {
  if (!usage) return 0;
  const price = CHAT_PRICES[model] ?? CHAT_FALLBACK_PRICE;
  const tokens =
    (usage.input_tokens ?? 0) * price.input +
    (usage.output_tokens ?? 0) * price.output +
    (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite +
    (usage.cache_read_input_tokens ?? 0) * price.cacheRead;
  return tokens / 1_000_000;
}
