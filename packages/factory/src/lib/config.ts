import { z } from "zod";

// Every setting has a default so a fresh machine only needs ANTHROPIC_API_KEY.
const envSchema = z.object({
  /**
   * advisory: the independent acceptance tests are reported (verify report,
   * task board, summary) but don't fail the build. blocking: failures go to
   * test triage and a fix round like any failed test.
   */
  ACCEPTANCE_MODE: z.enum(["advisory", "blocking"]).default("advisory"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  BASE_DOMAIN: z.string().default("localhost"),
  /**
   * The PRD gates (testability, scope, coverage of the customer's request).
   * advisory: reported in the PRD and PRD check reports only. repair: their
   * problems join the cross-reference problems in the one PRD repair round.
   */
  PRD_GATES: z.enum(["advisory", "repair"]).default("advisory"),
  /** Lets scripts/benchmark.ts skip the per-IP run limit (not the daily spend cap). Unset disables it. */
  BENCHMARK_TOKEN: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(16).optional()),
  /** on: the researcher and requirements agents may ask the customer questions between stages. */
  CUSTOMER_QUESTIONS: z.enum(["on", "off"]).default("on"),
  /** How long a run waits for the customer's answers before continuing with the agents' own choices. */
  CUSTOMER_TIMEOUT_MINUTES: z.coerce.number().positive().default(15),
  DAILY_SPEND_CAP_USD: z.coerce.number().positive().default(100),
  DATA_DIR: z.string().default("./data"),
  DEPLOYER_URL: z.string().default("http://localhost:4100"),
  /** When set, overrides every stage's model (e.g. a cheap model for smoke-testing the pipeline). */
  // Compose passes an unset variable through as "", which must mean "no override".
  FACTORY_MODEL: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  /** "off" gives agents no librarian tools at all, for comparing runs with and without it. */
  LIBRARIAN: z.enum(["on", "off"]).default("on"),
  /** "off" stops storing new lessons; existing ones are still searchable. */
  LIBRARIAN_LESSONS: z.enum(["on", "off"]).default("on"),
  MAX_CONCURRENT_RUNS: z.coerce.number().int().positive().default(1),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Host port Traefik is published on; included in app URLs when it isn't 80. */
  PUBLIC_HTTP_PORT: z.coerce.number().int().positive().default(80),
  /** Most feedback rounds one deployed app can get. */
  MAX_REVISIONS: z.coerce.number().int().min(0).default(5),
  /** Budget for one feedback round on a deployed app; counts against the daily spend cap. */
  REVISION_BUDGET_USD: z.coerce.number().positive().default(5),
  RUN_BUDGET_USD: z.coerce.number().positive().default(15),
  RUNS_PER_IP_PER_DAY: z.coerce.number().int().positive().default(3),
});

export type Config = z.infer<typeof envSchema>;

export const config: Config = envSchema.parse(process.env);
