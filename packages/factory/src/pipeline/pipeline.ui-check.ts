import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type UiIssue = { detail: string; kind: string; selector?: string };

export type UiPageResult = {
  failures: UiIssue[];
  path: string;
  screenId: string;
  /** File name of the full-page screenshot in the verify stage folder. */
  screenshot: string | null;
  viewport: string;
  warnings: UiIssue[];
};

export type UiCheckResult = {
  pages: UiPageResult[];
  /** Why the browser checks didn't run (e.g. no Chromium outside the factory image); null when they ran. */
  skipped: string | null;
};

export type UiScreen = { path: string; screenId: string };

/** Desktop and phone: most layout breakage only shows at one of the two. */
export const UI_VIEWPORTS = [
  { height: 900, name: "desktop", width: 1366 },
  { height: 844, name: "mobile", width: 390 },
] as const;

const UI_CHECK_SCRIPT = fileURLToPath(new URL("../../ui-check/ui-check.mjs", import.meta.url));
const UI_CHECK_TIMEOUT_MS = 4 * 60_000;

/**
 * Opens every screen in headless Chromium at each viewport and reports text
 * people would see as broken (split words, overflowing text, sideways
 * scrolling), JS errors, failed requests and serious accessibility
 * violations, and saves screenshots. Free and deterministic: the browser
 * runs as a separate Node process (ui-check/ui-check.mjs).
 */
export async function runUiCheck({
  baseUrl,
  checkMobile = true,
  outDir,
  screens,
}: {
  baseUrl: string;
  /** False for desktop-first designs (ZT without a mobile requirement). */
  checkMobile?: boolean;
  outDir: string;
  screens: UiScreen[];
}): Promise<UiCheckResult> {
  const configPath = join(outDir, "ui-check.config.json");
  const viewports = checkMobile ? UI_VIEWPORTS : UI_VIEWPORTS.filter((v) => v.name === "desktop");
  await writeFile(configPath, JSON.stringify({ baseUrl, outDir, screens, viewports }));

  const proc = Bun.spawn(["node", UI_CHECK_SCRIPT, configPath], { stderr: "pipe", stdin: "ignore", stdout: "pipe" });
  const timer = setTimeout(() => proc.kill("SIGKILL"), UI_CHECK_TIMEOUT_MS);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);

  const output = parseLastJsonLine(stdout) as { results?: UiPageResult[]; unavailable?: string } | null;
  if (output?.unavailable) return { pages: [], skipped: output.unavailable };
  if (!output?.results) {
    // A crash of the checker is the factory's problem, not the app's: skip rather than fail the build.
    return { pages: [], skipped: `UI check crashed (exit ${exitCode}): ${stderr.trim().slice(-500) || "no output"}` };
  }
  return { pages: output.results, skipped: null };
}

/** Routes to check: the developer's screen map, or just "/" when there is none. */
export function uiScreensFrom(devHandoff: unknown): UiScreen[] {
  const screens = (devHandoff as { screens?: { path: string | null; screenId: string }[] } | undefined)?.screens ?? [];
  const reachable = screens.filter((s): s is UiScreen => typeof s.path === "string" && s.path.startsWith("/"));
  return reachable.length ? reachable : [{ path: "/", screenId: "home" }];
}

/** One line per failure, grouped by screen and viewport, for the fix agent. */
export function summarizeUiFailures(result: UiCheckResult): string {
  return result.pages
    .filter((p) => p.failures.length)
    .map(
      (p) =>
        `${p.screenId} ${p.path} @ ${p.viewport}:\n${p.failures
          .map((f) => `  - [${f.kind}] ${f.detail}${f.selector ? ` (${f.selector})` : ""}`)
          .join("\n")}`,
    )
    .join("\n");
}

function parseLastJsonLine(stdout: string): unknown {
  const line = stdout.trim().split("\n").at(-1);
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// Mongolian "утас" (phone) inflects: утсан, утсаар, утсанд; match the stem.
const MOBILE_REQUIREMENT = /mobile|phone|tablet|responsive|ута?с|таблет/i;

/**
 * Custom designs are checked at phone width always. ZT is desktop-first
 * (§1.6): phone width only when the UI design or a PRD non-functional
 * requirement says mobile use matters.
 */
export function shouldCheckMobile({
  designSystem,
  prd,
  uiDesign,
}: {
  designSystem: "zt" | "custom";
  prd: unknown;
  uiDesign: unknown;
}): boolean {
  if (designSystem !== "zt") return true;
  const decided = (uiDesign as { mobile?: { required?: boolean } } | undefined)?.mobile?.required;
  if (typeof decided === "boolean") return decided;
  const nfrs = (prd as { nonFunctional?: { category: string; target: string }[] } | undefined)?.nonFunctional ?? [];
  return nfrs.some((n) => MOBILE_REQUIREMENT.test(`${n.category} ${n.target}`));
}
