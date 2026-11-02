import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS = fileURLToPath(new URL("../../../acceptance-harness/harness.mjs", import.meta.url));

// A stand-in app: header auth on /api/whoami-header, cookie session on /api/session + /api/whoami-cookie.
let server: ReturnType<typeof Bun.serve>;
beforeAll(() => {
  server = Bun.serve({
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/api/session" && request.method === "POST") {
        const { role } = (await request.json()) as { role: string };
        return new Response(null, { headers: { "set-cookie": `sid=${role}; Path=/; HttpOnly` }, status: 204 });
      }
      if (url.pathname === "/api/whoami-header") return Response.json({ role: request.headers.get("x-role") });
      if (url.pathname === "/api/token-session" && request.method === "POST") {
        const { role } = (await request.json()) as { role: string };
        return Response.json({ session: { token: `tok-${role}` } }, { status: 201 });
      }
      if (url.pathname === "/api/whoami-token") {
        const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
        return token ? Response.json({ role: token.replace(/^tok-/, "") }) : Response.json({ error: "no token" }, { status: 401 });
      }
      if (url.pathname === "/api/whoami-cookie") {
        const sid = request.headers.get("cookie")?.match(/sid=([^;]+)/)?.[1] ?? null;
        return sid ? Response.json({ role: sid }) : Response.json({ error: "no session" }, { status: 401 });
      }
      if (url.pathname === "/api/items" && request.method === "POST") return Response.json(await request.json(), { status: 201 });
      return new Response("not found", { status: 404 });
    },
    port: 0,
  });
});
afterAll(() => server.stop(true));

/** Runs an acceptance test file the way the gate does: plain node, TAP output. */
async function runNode(testSource: string, auth: unknown) {
  const dir = await mkdtemp(join(tmpdir(), "harness-"));
  const file = join(dir, "case.test.mjs");
  await writeFile(file, testSource.replaceAll("HARNESS", HARNESS));
  const proc = Bun.spawn(["node", "--test", "--test-reporter=tap", file], {
    env: { ...process.env, ACCEPTANCE_AUTH: JSON.stringify(auth), BASE_URL: `http://127.0.0.1:${server.port}` },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { code, out };
}

describe("acceptance harness", () => {
  test("api() sends JSON and applies header auth", async () => {
    const { code, out } = await runNode(
      `import assert from "node:assert/strict"; import { test } from "node:test"; import { api, uniqueName } from "HARNESS";
       test("TC-1: header role", async () => {
         const me = await api("GET", "/api/whoami-header", { role: "Owner" });
         assert.equal(me.json.role, "Owner");
         const name = uniqueName("Car");
         const created = await api("POST", "/api/items", { body: { name } });
         assert.equal(created.status, 201);
         assert.equal(created.json.name, name);
         assert.equal((await api("GET", "/nope")).status, 404);
       });`,
      { kind: "header", header: { name: "X-Role", value: "{role}" } },
    );
    expect(out).toContain("ok 1 - TC-1: header role");
    expect(code).toBe(0);
  });

  test("api() keeps a returned token and sends it as a Bearer header", async () => {
    const { code, out } = await runNode(
      `import assert from "node:assert/strict"; import { test } from "node:test"; import { api } from "HARNESS";
       test("TC-3: token role", async () => {
         assert.equal((await api("GET", "/api/whoami-token")).status, 401);
         assert.equal((await api("GET", "/api/whoami-token", { role: "Owner" })).json.role, "Owner");
       });`,
      {
        kind: "login",
        login: { body: '{"role":"{role}"}', method: "POST", path: "/api/token-session", token: { field: "session.token", header: "Authorization", prefix: "Bearer ", storageKey: null } },
      },
    );
    expect(out).toContain("ok 1 - TC-3: token role");
    expect(code).toBe(0);
  });

  test("api() logs in once per role and sends the session cookie", async () => {
    const { code, out } = await runNode(
      `import assert from "node:assert/strict"; import { test } from "node:test"; import { api } from "HARNESS";
       test("TC-2: cookie role", async () => {
         assert.equal((await api("GET", "/api/whoami-cookie")).status, 401);
         assert.equal((await api("GET", "/api/whoami-cookie", { role: "Renter" })).json.role, "Renter");
       });`,
      { kind: "login", login: { body: '{"role":"{role}"}', method: "POST", path: "/api/session" } },
    );
    expect(out).toContain("ok 1 - TC-2: cookie role");
    expect(code).toBe(0);
  });
});
