// Acceptance test harness, written into every app's acceptance/ folder by the
// software factory. The tests in this folder are black-box: they talk to the
// running app only over HTTP (api) or through a real browser (withPage), so
// they don't depend on the app's language, framework or test runner.
//
// The factory runs them with:  node --test --test-reporter=tap "acceptance/**/*.test.mjs"
// against a throwaway copy of the app (BASE_URL), never the live one.

import { readFileSync } from "node:fs";

export const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");

/**
 * How a client acts as a role, from the architecture's auth contract:
 * { kind: "none" }
 * { kind: "header", header: { name: "X-Role", value: "{role}" } }
 * { kind: "login", login: { method: "POST", path: "/api/session", body: "{\"role\":\"{role}\"}", token: null } }
 *   token, when the login returns one instead of a cookie:
 *   { field: "token", header: "Authorization", prefix: "Bearer ", storageKey: "token" | null }
 */
const auth = loadAuth();

const sessions = new Map();
let counter = 0;

/** A name no other test (or earlier run) uses, so tests never collide on data. */
export function uniqueName(prefix = "Test") {
  counter += 1;
  return `${prefix} ${Date.now().toString(36)}${counter}`;
}

/**
 * One HTTP request to the app. `role` applies the app's auth for that role.
 * Returns { status, json, text, headers }; json is null when the body isn't JSON.
 */
export async function api(method, path, { body, headers = {}, query, role } = {}) {
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value));
  const roleHeaders = role ? await authHeaders(role) : {};
  const response = await fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }), ...roleHeaders, ...headers },
    method,
    redirect: "manual",
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { headers: response.headers, json, status: response.status, text };
}

/**
 * Runs `fn(page)` in a fresh browser context, signed in as `role` when given,
 * with relative URLs resolved against the app (page.goto("/orders")).
 */
export async function withPage(fn, { role, viewport = { height: 900, width: 1366 } } = {}) {
  const browser = await sharedBrowser();
  const context = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: role && auth.kind === "header" ? await authHeaders(role) : undefined,
    viewport,
  });
  try {
    if (role && auth.kind === "login") {
      // The context's request client shares its cookie jar with the pages.
      const login = auth.login;
      const response = await context.request.fetch(BASE_URL + login.path, {
        data: JSON.parse(fill(login.body, role)),
        headers: { "content-type": "application/json" },
        method: login.method,
      });
      const token = login.token ? pick(await response.json().catch(() => null), login.token.field) : null;
      if (token && login.token.storageKey) {
        // SPAs that keep the token in localStorage start signed in.
        await context.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [login.token.storageKey, String(token)]);
      }
      if (token) await context.setExtraHTTPHeaders({ [login.token.header]: `${login.token.prefix}${token}` });
    }
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    return await fn(page);
  } finally {
    await context.close();
  }
}

async function authHeaders(role) {
  if (auth.kind === "header") return { [auth.header.name]: fill(auth.header.value, role) };
  if (auth.kind !== "login") return {};
  if (!sessions.has(role)) {
    const login = auth.login;
    const response = await fetch(BASE_URL + login.path, {
      body: fill(login.body, role),
      headers: { "content-type": "application/json" },
      method: login.method,
      redirect: "manual",
    });
    if (login.token) {
      const token = pick(await response.json().catch(() => null), login.token.field);
      sessions.set(role, token ? { [login.token.header]: `${login.token.prefix}${token}` } : {});
    } else {
      const cookie = response.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      sessions.set(role, cookie ? { cookie } : {});
    }
  }
  return sessions.get(role);
}

let browserPromise = null;
async function sharedBrowser() {
  if (!browserPromise) {
    // Playwright comes from the factory image, not the app: PLAYWRIGHT_MODULE points at it.
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
    browserPromise = chromium.launch();
    const { after } = await import("node:test");
    after(async () => (await browserPromise).close());
  }
  return browserPromise;
}

function pick(value, path) {
  return String(path)
    .split(".")
    .reduce((current, key) => (current == null ? undefined : current[key]), value);
}

function fill(template, role) {
  return String(template).replaceAll("{role}", role);
}

function loadAuth() {
  const raw = process.env.ACCEPTANCE_AUTH ?? readFileSync(new URL("./harness.config.json", import.meta.url), "utf8");
  const parsed = JSON.parse(raw);
  return parsed.auth ?? parsed;
}
