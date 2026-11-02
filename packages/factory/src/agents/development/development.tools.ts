import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { runUiCheck, summarizeUiFailures } from "../../pipeline/pipeline.ui-check";

export const BROWSER_SERVER = "browser";

export const DEVELOPMENT_TOOL_NAMES = [`mcp__${BROWSER_SERVER}__browser_check`];

/**
 * Lets the developer run the verify gate's own browser checks against its
 * local server mid-session. Catching broken text or a dead image here costs a
 * tool call; catching it in verify costs a fix round and a re-review. It also
 * removes the reason developers tried (and failed, slowly) to install their
 * own Playwright, which let the prompt cache expire.
 *
 * Scoped to 127.0.0.1: the agent picks only a port and paths.
 */
export function developmentMcpServer(stageDir: string, checkMobile: boolean) {
  let call = 0;
  return createSdkMcpServer({
    name: BROWSER_SERVER,
    tools: [
      tool(
        "browser_check",
        "Open screens of your locally running app in headless Chromium at the widths the factory checks (desktop 1366px, plus phone 390px when this design requires mobile) and report what the factory's verify step would fail: words split across lines, text overflowing its box, sideways scrolling, broken images, JS errors, failed requests (404/5xx) and serious accessibility violations. Start your server in the background first. Takes about 3 seconds per screen and width.",
        {
          paths: z
            .array(z.string().startsWith("/"))
            .min(1)
            .max(12)
            .describe("Paths from the app root, one per screen, e.g. [\"/\", \"/#/items/1\"]"),
          port: z.number().int().min(1024).max(65_535).describe("Port your server listens on"),
        },
        async ({ paths, port }) => {
          call += 1;
          const text = await browserCheck({ checkMobile, outDir: join(stageDir, `browser-check-${call}`), paths, port });
          return { content: [{ text, type: "text" as const }], isError: false };
        },
      ),
    ],
  });
}

/** The tool's body, exported so it can be exercised without a model. */
export async function browserCheck({
  checkMobile = true,
  outDir,
  paths,
  port,
}: {
  checkMobile?: boolean;
  outDir: string;
  paths: string[];
  port: number;
}): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const result = await runUiCheck({
    baseUrl: `http://127.0.0.1:${port}`,
    checkMobile,
    outDir,
    screens: paths.map((path, i) => ({ path, screenId: `screen-${i + 1}` })),
  });
  return formatResult(result);
}

function formatResult(result: Awaited<ReturnType<typeof runUiCheck>>): string {
  if (result.skipped) return `Browser check could not run: ${result.skipped}. Rely on HTTP checks and the code; verify will run it later.`;
  const failing = result.pages.filter((p) => p.failures.length);
  const warnings = result.pages.reduce((n, p) => n + p.warnings.length, 0);
  if (!failing.length) return `All ${result.pages.length} screen × width checks pass (${warnings} warnings).`;
  return `${failing.length} of ${result.pages.length} screen × width checks fail (${warnings} warnings):\n${summarizeUiFailures(result)}`;
}
