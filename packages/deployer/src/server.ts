import { join } from "node:path";
import { z } from "zod";

/**
 * The only service with the Docker socket. It exposes a deliberately tiny API
 * keyed by runId, so agents can build and run their own workspace and nothing
 * else: no arbitrary images, paths, mounts or flags.
 */
const env = z
  .object({
    APP_CPUS: z.string().default("1"),
    APP_MEMORY: z.string().default("512m"),
    APPS_NETWORK: z.string().default("factory-apps"),
    BASE_DOMAIN: z.string().default("localhost"),
    PORT: z.coerce.number().int().default(4100),
    RUNS_DIR: z.string().default("/data/runs"),
    TOKEN_FILE: z.string().default("/data/deployer.token"),
  })
  .parse(process.env);

const token = await loadOrCreateToken(env.TOKEN_FILE);

const runIdSchema = z.string().regex(/^[a-z0-9]{10}$/);
const buildSchema = z.object({ runId: runIdSchema });
/**
 * "live" is the app people use (routed, persistent volume). "acceptance" is a
 * throwaway copy of the same image for the factory's acceptance tests: not
 * routed, fresh /data each start, so test data never reaches the live app.
 */
const instanceSchema = z.enum(["live", "acceptance"]).default("live");
const runSchema = z.object({ instance: instanceSchema, port: z.number().int().min(1).max(65_535).default(8080), runId: runIdSchema });
const checkSchema = z.object({ instance: instanceSchema, path: z.string().startsWith("/").max(500).default("/health"), runId: runIdSchema });
const removeSchema = z.object({ instance: z.literal("acceptance"), runId: runIdSchema });

type Instance = z.infer<typeof instanceSchema>;

const names = (runId: string, instance: Instance = "live") => ({
  container: instance === "acceptance" ? `factory-app-${runId}-acc` : `factory-app-${runId}`,
  image: `factory-app-${runId}:latest`,
  volume: `factory-app-${runId}-data`,
});

Bun.serve({
  hostname: "0.0.0.0",
  port: env.PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") return Response.json({ ok: true });
    if (request.headers.get("x-deployer-token") !== token) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (request.method !== "POST") return Response.json({ error: "Not found" }, { status: 404 });

    try {
      const body = await request.json().catch(() => ({}));
      if (pathname === "/build") return Response.json(await build(buildSchema.parse(body)));
      if (pathname === "/run") return Response.json(await run(runSchema.parse(body)));
      if (pathname === "/check") return Response.json(await check(checkSchema.parse(body)));
      if (pathname === "/logs") return Response.json(await logs(buildSchema.parse(body)));
      if (pathname === "/remove") return Response.json(await remove(removeSchema.parse(body)));
      return Response.json({ error: "Not found" }, { status: 404 });
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 500;
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
    }
  },
});
console.info("[deployer] listening", { port: env.PORT });

async function build({ runId }: { runId: string }) {
  const context = join(env.RUNS_DIR, runId, "workspace");
  if (!(await Bun.file(join(context, "Dockerfile")).exists())) {
    return { ok: false, output: "No Dockerfile at the workspace root." };
  }
  const result = await docker(["build", "--progress=plain", "-t", names(runId).image, context], 20 * 60_000);
  return { exitCode: result.exitCode, ok: result.exitCode === 0, output: tail(result.output, 150) };
}

async function run({ instance, port, runId }: { instance: Instance; port: number; runId: string }) {
  const n = names(runId, instance);
  const host = `${runId}.apps.${env.BASE_DOMAIN}`;
  await docker(["rm", "-f", n.container], 60_000);
  const placement =
    instance === "acceptance"
      ? ["--restart", "no", "--tmpfs", "/data:rw,size=256m", "--label", "factory.acceptance=true"]
      : [
          "--restart", "unless-stopped",
          "-v", `${n.volume}:/data`,
          "--label", "traefik.enable=true",
          "--label", `traefik.http.routers.app-${runId}.rule=Host(\`${host}\`)`,
          "--label", `traefik.http.routers.app-${runId}.entrypoints=web`,
          "--label", `traefik.http.services.app-${runId}.loadbalancer.server.port=${port}`,
        ];
  const result = await docker(
    [
      "run", "-d",
      "--name", n.container,
      "--network", env.APPS_NETWORK,
      "--memory", env.APP_MEMORY,
      "--cpus", env.APP_CPUS,
      "--pids-limit", "512",
      "-e", `PORT=${port}`,
      "--label", "factory.app=true",
      "--label", `factory.port=${port}`,
      ...placement,
      n.image,
    ],
    60_000,
  );
  if (result.exitCode !== 0) return { ok: false, output: tail(result.output, 50) };
  await Bun.sleep(3_000);
  const state = await docker(["inspect", "-f", "{{.State.Status}}", n.container], 10_000);
  const url = instance === "acceptance" ? `http://${n.container}:${port}` : `http://${host}`;
  return { container: n.container, ok: state.output.trim() === "running", state: state.output.trim(), url };
}

async function remove({ instance, runId }: { instance: "acceptance"; runId: string }) {
  const result = await docker(["rm", "-f", names(runId, instance).container], 60_000);
  return { ok: result.exitCode === 0 };
}

async function check({ instance, path, runId }: { instance: Instance; path: string; runId: string }) {
  const n = names(runId, instance);
  const portResult = await docker(["inspect", "-f", '{{index .Config.Labels "factory.port"}}', n.container], 10_000);
  if (portResult.exitCode !== 0) return { error: "Container not found; call docker_run first.", status: null };
  const port = portResult.output.trim();

  // Apps often need a few seconds to boot; retry connection errors briefly.
  let lastError = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const response = await fetch(`http://${n.container}:${port}${path}`, { signal: AbortSignal.timeout(5_000) });
      const text = await response.text();
      return { bodyExcerpt: text.slice(0, 1_500), status: response.status };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await Bun.sleep(2_000);
    }
  }
  return { error: lastError, status: null };
}

async function logs({ runId }: { runId: string }) {
  const result = await docker(["logs", "--tail", "200", names(runId).container], 15_000);
  return { output: result.output };
}

async function docker(args: string[], timeoutMs: number) {
  const proc = Bun.spawn(["docker", ...args], { stderr: "pipe", stdout: "pipe" });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { exitCode, output: `${stdout}${stderr}` };
}

// Self-provisioned shared secret: the factory reads it from the same data
// volume, so nothing needs configuring and app containers can't call us.
async function loadOrCreateToken(path: string): Promise<string> {
  const file = Bun.file(path);
  if (await file.exists()) {
    const existing = (await file.text()).trim();
    if (existing.length >= 32) return existing;
  }
  const fresh = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  await Bun.write(path, fresh);
  return fresh;
}

function tail(text: string, lines: number): string {
  return text.split("\n").slice(-lines).join("\n");
}
