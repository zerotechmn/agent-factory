import { z } from "zod";

// Every setting has a default so a fresh machine only needs ANTHROPIC_API_KEY.
const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  BASE_DOMAIN: z.string().default("localhost"),
  DAILY_SPEND_CAP_USD: z.coerce.number().positive().default(100),
  DATA_DIR: z.string().default("./data"),
  DEPLOYER_URL: z.string().default("http://localhost:4100"),
  FACTORY_MODEL: z.string().default("claude-opus-5-5"),
  MAX_CONCURRENT_RUNS: z.coerce.number().int().positive().default(1),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Host port Traefik is published on; included in app URLs when it isn't 80. */
  PUBLIC_HTTP_PORT: z.coerce.number().int().positive().default(80),
  RUN_BUDGET_USD: z.coerce.number().positive().default(15),
  RUNS_PER_IP_PER_DAY: z.coerce.number().int().positive().default(3),
});

export type Config = z.infer<typeof envSchema>;

export const config: Config = envSchema.parse(process.env);
