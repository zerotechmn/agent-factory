import type { Acceptance } from "./acceptance.schema";

/** Renders the acceptance suite for people; the agent only produces the structured data. */
export function renderAcceptance(a: Acceptance): string {
  const counts = { api: 0, e2e: 0, skipped: 0 };
  for (const c of a.coverage) counts[c.kind] += 1;
  const out: string[] = [];
  out.push("# Acceptance tests (independent tester)", "");
  out.push(
    `Black-box tests written from the test plan and the architecture's API contract, without seeing the code. The verify gate runs them against a throwaway copy of the app; the developer can read them but not change them.`,
    "",
  );
  out.push(`**Coverage:** ${counts.api} API, ${counts.e2e} browser, ${counts.skipped} skipped, of ${a.coverage.length} test cases.`, "");
  out.push(`**Auth:** ${authLine(a.auth)}`, "");
  out.push("| Test case | Kind | File | Note |", "| --- | --- | --- | --- |");
  for (const c of a.coverage) out.push(`| ${c.testCaseId} | ${c.kind} | ${c.file ? `\`${c.file}\`` : "—"} | ${escape(c.reason) || "—"} |`);
  out.push("", "## Files", "");
  for (const f of a.files) out.push(`- \`${f.path}\` — ${f.content.split("\n").length} lines, ${(f.content.match(/\btest\(/g) ?? []).length} tests`);
  return out.join("\n");
}

function authLine(auth: Acceptance["auth"]): string {
  if (auth.kind === "header" && auth.header) return `header \`${auth.header.name}: ${auth.header.value}\``;
  if (auth.kind === "login" && auth.login) {
    const keep = auth.login.token ? `token from \`${auth.login.token.field}\` sent as \`${auth.login.token.header}: ${auth.login.token.prefix}…\`` : "cookies";
    return `\`${auth.login.method} ${auth.login.path}\` with \`${auth.login.body}\`, ${keep} kept per role`;
  }
  return "none";
}

function escape(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
