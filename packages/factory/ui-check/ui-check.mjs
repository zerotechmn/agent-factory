// Browser checks for the verify gate. Runs under Node (not Bun) as its own
// process: Playwright is most reliable on Node, and a browser crash here can
// never take the factory down.
//
// Usage: node ui-check.mjs <config.json>
// Config: { baseUrl, outDir, screens: [{ screenId, path }], viewports: [{ name, width, height }] }
// Prints one JSON object to stdout: { unavailable } or { results: [...] }.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
const MAX_ISSUES_PER_PAGE = 15;

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch (error) {
  finish({ unavailable: `Playwright is not installed: ${error.message}` });
}

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  // No browser binary (e.g. local development outside the factory image) is a
  // missing capability, not an app failure: the gate records it as skipped.
  finish({ unavailable: `Chromium could not start: ${error.message.split("\n")[0]}` });
}

const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const origin = new URL(config.baseUrl).origin;
const results = [];

for (const viewport of config.viewports) {
  for (const screen of config.screens) {
    results.push(await checkScreen(screen, viewport));
  }
}
await browser.close();
finish({ results });

async function checkScreen(screen, viewport) {
  const failures = [];
  const warnings = [];
  const context = await browser.newContext({ viewport: { height: viewport.height, width: viewport.width } });
  const page = await context.newPage();

  page.on("pageerror", (error) => failures.push({ detail: error.message.slice(0, 300), kind: "js-error" }));
  page.on("console", (message) => {
    if (message.type() === "error") warnings.push({ detail: message.text().slice(0, 300), kind: "console-error" });
  });
  page.on("response", (response) => {
    const url = response.url();
    const status = response.status();
    // Only the app's own requests; a missing favicon is noise, not a defect.
    if (status < 400 || !url.startsWith(origin) || url.endsWith("/favicon.ico")) return;
    const issue = { detail: `${status} ${url.slice(origin.length) || "/"}`, kind: "failed-request" };
    // A missing resource or a server error is a defect. 401/403 and other 4xx
    // are usually the app working as designed for an anonymous visitor (e.g.
    // "am I logged in?" probes), so they are only warnings.
    if (status === 404 || status >= 500) failures.push(issue);
    else warnings.push(issue);
  });

  const url = `${config.baseUrl}${screen.path}`;
  let screenshot = null;
  try {
    const response = await page.goto(url, { timeout: 20_000, waitUntil: "networkidle" });
    if (response && response.status() >= 400) failures.push({ detail: `HTTP ${response.status()}`, kind: "page-load" });
    // Let client-side rendering and web fonts settle before measuring.
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(400);

    const layout = await page.evaluate(detectLayoutIssues);
    failures.push(...layout);

    await page.addScriptTag({ content: axeSource });
    const axe = await page.evaluate(() =>
      // eslint-disable-next-line no-undef
      axe.run(document, { resultTypes: ["violations"], runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } }),
    );
    for (const violation of axe.violations) {
      const issue = {
        detail: `${violation.id}: ${violation.help} (${violation.nodes.length} element${violation.nodes.length === 1 ? "" : "s"})`,
        kind: `a11y-${violation.impact ?? "unknown"}`,
        selector: violation.nodes[0]?.target?.join(" ") ?? "",
      };
      // Serious and critical violations block real users; the rest are advisory.
      if (violation.impact === "serious" || violation.impact === "critical") failures.push(issue);
      else warnings.push(issue);
    }

    screenshot = `${screen.screenId}-${viewport.name}.png`;
    await page.screenshot({ fullPage: true, path: join(config.outDir, screenshot) });
  } catch (error) {
    failures.push({ detail: error.message.split("\n")[0].slice(0, 300), kind: "page-load" });
  }
  await context.close();

  return {
    failures: dedupe(failures).slice(0, MAX_ISSUES_PER_PAGE),
    path: screen.path,
    screenId: screen.screenId,
    screenshot,
    viewport: viewport.name,
    warnings: dedupe(warnings).slice(0, MAX_ISSUES_PER_PAGE),
  };
}

/** Runs in the page. Finds text that a person would see as broken. */
function detectLayoutIssues() {
  const issues = [];
  const vw = document.documentElement.clientWidth;

  const selectorFor = (el) => {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && parts.length < 4; node = node.parentElement) {
      if (node.id) {
        parts.unshift(`#${node.id}`);
        break;
      }
      const cls = [...node.classList].slice(0, 2).map((c) => `.${c}`).join("");
      parts.unshift(`${node.tagName.toLowerCase()}${cls}`);
    }
    return parts.join(" > ");
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 2 || rect.height <= 2) return false;
    // Screen-reader-only content (e.g. a table header hidden on mobile) is
    // clipped on an ancestor, not on the element itself: walk up the chain.
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const ncs = node === el ? cs : getComputedStyle(node);
      if (ncs.clip !== "auto" || ncs.clipPath !== "none" || Number(ncs.opacity) === 0) return false;
      const box = node.getBoundingClientRect();
      if (ncs.overflow !== "visible" && (box.width <= 2 || box.height <= 2)) return false;
    }
    return true;
  };

  if (document.documentElement.scrollWidth > vw + 1) {
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => visible(el) && el.getBoundingClientRect().right > vw + 1)
      // The innermost offender is the one to fix, not every ancestor.
      .filter((el, _, all) => !all.some((other) => other !== el && el.contains(other)))
      .slice(0, 3)
      .map((el) => `${selectorFor(el)} (right edge ${Math.round(el.getBoundingClientRect().right)}px)`);
    issues.push({
      detail: `Page is ${document.documentElement.scrollWidth}px wide in a ${vw}px viewport. Widest: ${offenders.join("; ")}`,
      kind: "sideways-scroll",
    });
  }

  const range = document.createRange();
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || ["SCRIPT", "STYLE", "INPUT", "SELECT", "TEXTAREA", "OPTION"].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());

    // Text spilling out of its own box. Clipped or scrolling boxes are deliberate.
    if (ownText.length && cs.overflowX === "visible" && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      issues.push({
        detail: `"${el.textContent.trim().slice(0, 40)}" is ${el.scrollWidth}px wide in a ${el.clientWidth}px box`,
        kind: "text-overflow",
        selector: selectorFor(el),
      });
    }

    // An ordinary word split across lines ("Viewi / ng"). Long tokens such as
    // URLs or emails may legitimately wrap, so only words up to 20 characters count.
    for (const node of ownText) {
      for (const match of node.textContent.matchAll(/[\p{L}\p{N}]{3,20}/gu)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        if (tops.size > 1) {
          issues.push({
            detail: `Word "${match[0]}" is split across ${tops.size} lines`,
            kind: "broken-word",
            selector: selectorFor(el),
          });
        }
      }
    }
  }

  // Images that were requested but failed (dead URL, wrong path). Lazy images
  // not loaded yet are skipped: they are incomplete, not broken.
  for (const img of document.querySelectorAll("img")) {
    // Not visible(): a broken image without set dimensions collapses to 0×0,
    // which is exactly the case to catch. Only deliberately hidden ones are skipped.
    const cs = getComputedStyle(img);
    if (cs.display === "none" || cs.visibility === "hidden" || !img.complete || img.naturalWidth > 0) continue;
    issues.push({
      detail: `Image failed to load: ${(img.currentSrc || img.src || "(no src)").slice(0, 120)}`,
      kind: "broken-image",
      selector: selectorFor(img),
    });
  }

  // Name the global wrapping rule behind broken words; it is usually the root cause.
  if (issues.some((i) => i.kind === "broken-word")) {
    const rules = [...document.styleSheets]
      .flatMap((sheet) => {
        try {
          return [...sheet.cssRules];
        } catch {
          return [];
        }
      })
      .filter((rule) => rule.style && (rule.style.overflowWrap === "anywhere" || rule.style.wordBreak === "break-all"))
      .map((rule) => `${rule.selectorText} { ${rule.style.overflowWrap ? `overflow-wrap: ${rule.style.overflowWrap}` : `word-break: ${rule.style.wordBreak}`} }`);
    if (rules.length) issues.push({ detail: `Likely cause: ${rules.slice(0, 3).join("; ")}`, kind: "broken-word-cause" });
  }
  return issues;
}

function dedupe(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue.kind}|${issue.selector ?? ""}|${issue.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function finish(output) {
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exit(0);
}
