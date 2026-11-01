import { join } from "node:path";

import { config } from "./config";

export type DeployerResponse = { body: string; ok: boolean };

/** Calls the deployer sidecar, authenticating with the token it wrote to the shared data volume. */
export async function callDeployer(path: string, body: Record<string, unknown>): Promise<DeployerResponse> {
  try {
    const response = await fetch(`${config.DEPLOYER_URL}${path}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-deployer-token": await readToken() },
      method: "POST",
    });
    return { body: await response.text(), ok: response.ok };
  } catch (error) {
    return { body: `Deployer unreachable: ${error instanceof Error ? error.message : String(error)}`, ok: false };
  }
}

async function readToken(): Promise<string> {
  // Read per call: the deployer may start (and create the token) after the factory.
  const file = Bun.file(join(config.DATA_DIR, "deployer.token"));
  return (await file.exists()) ? (await file.text()).trim() : "";
}
