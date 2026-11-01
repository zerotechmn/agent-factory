import { z } from "zod";

import { jsonBlock, type AgentDefinition } from "../agents.shared";

const schema = z.object({
  apiEndpoints: z.array(z.object({ description: z.string(), method: z.string(), path: z.string() })),
  commands: z.object({
    install: z.string(),
    start: z.string().describe("Starts the server, honouring $PORT"),
    test: z.string().describe("Runs the automated test suite, non-interactive, exits non-zero on failure"),
  }),
  dataModel: z.array(z.object({ entity: z.string(), fields: z.array(z.string()) })),
  dockerfilePlan: z.string().describe("Base image and build/run steps"),
  fileTree: z.array(z.string()).describe("Planned relative file paths"),
  rationale: z.string(),
  screens: z.array(z.object({ description: z.string(), name: z.string() })),
  stack: z.object({
    backend: z.string(),
    frontend: z.string(),
    language: z.string(),
    storage: z.string(),
    testFramework: z.string(),
  }),
});

export const designAgent: AgentDefinition<typeof schema> = {
  allowedTools: [],
  buildPrompt: (ctx) => `Design the application for the requirements below.

Choose whatever web stack best fits the product, constrained to runtimes available in the execution environment and to the application contract. Favour boring, well-known tools with few dependencies: the developer must build it, and the factory must run the tests, quickly and cheaply.

A test plan is being written in parallel from the same requirements. It will mostly contain HTTP-level API tests, unit tests and a few browser-free end-to-end flows, so pick a test framework that handles HTTP-level tests well, and a test command that runs the whole suite non-interactively and exits non-zero on failure.

For the UI, use the factory:frontend-design skill: give the product a deliberate visual direction suited to its subject, and describe it in the screens and rationale so the developer can follow it.

${jsonBlock("Requirements", ctx.handoffs.requirements)}${ctx.handoffs.research ? `\n\n${jsonBlock("UI patterns users expect (from research)", (ctx.handoffs.research as { uiPatterns?: unknown }).uiPatterns)}` : ""}`,
  cwd: (ctx) => ctx.stageDir,
  role: "Software Designer",
  runtime: "doc",
  schema,
};
