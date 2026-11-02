import { z } from "zod";

/**
 * The acceptance tester's output: black-box test files plus the auth recipe
 * the harness needs. Files are returned as data, not written with tools, so
 * the stage stays cheap (no Claude Code preset, no tool turns) and the
 * factory decides where they land.
 */
export const acceptanceSchema = z.object({
  auth: z.object({
    header: z
      .object({ name: z.string(), value: z.string().describe('Use {role} where the role goes, e.g. "{role}"') })
      .nullable()
      .describe('kind "header" only'),
    kind: z.enum(["none", "header", "login"]).describe("From the architecture's auth contract"),
    login: z
      .object({
        body: z.string().describe('JSON body with {role} where the role goes, e.g. {"name":"Test {role}","role":"{role}"}'),
        method: z.string(),
        path: z.string(),
        token: z
          .object({
            field: z.string().describe('Response JSON field holding the token, dotted for nesting, e.g. "token" or "session.token"'),
            header: z.string().describe('Usually "Authorization"'),
            prefix: z.string().describe('e.g. "Bearer " (with the space), or ""'),
            storageKey: z
              .string()
              .nullable()
              .describe("localStorage key the web app reads the token from, so browser tests start signed in; null if unknown"),
          })
          .nullable()
          .describe("When login returns a token instead of setting a cookie; null for cookie sessions"),
      })
      .nullable()
      .describe('kind "login" only: the request that starts a session as a role (cookies or the returned token are kept per role)'),
  }),
  coverage: z
    .array(
      z.object({
        file: z.string().describe('The file that tests it, or "" when skipped'),
        kind: z.enum(["api", "e2e", "skipped"]),
        reason: z.string().describe('Why skipped (e.g. "needs email delivery"), or ""'),
        testCaseId: z.string(),
      }),
    )
    .describe("Every test case in the test plan, exactly once"),
  files: z
    .array(
      z.object({
        content: z.string().describe("Complete ES module source"),
        path: z.string().describe("acceptance/<feature-or-area>.test.mjs"),
      }),
    )
    .min(1)
    .max(12),
});

export type Acceptance = z.infer<typeof acceptanceSchema>;
