import { z } from "zod";

import { jsonBlock, type AgentDefinition } from "../agents.shared";
import { prdForArchitecture, slicePrd } from "../requirements/requirements.utils";

const schema = z.object({
  apiEndpoints: z.array(
    z.object({
      description: z.string(),
      method: z.string(),
      operationId: z.string().describe("camelCase verb + noun, e.g. approveOrder; screens' actions reference it"),
      path: z.string(),
      servesScreens: z.array(z.string()).describe("PRD screen ids (S-xx) that call this endpoint"),
    }),
  ),
  commands: z.object({
    install: z.string(),
    start: z.string().describe("Starts the server, honouring $PORT"),
    test: z.string().describe("Runs the automated test suite, non-interactive, exits non-zero on failure"),
  }),
  dataModel: z
    .array(z.object({ entity: z.string().describe("PRD entity id and name, e.g. ENT-01 order"), fields: z.array(z.string()) }))
    .describe("Storage schema implementing the PRD entities"),
  dockerfilePlan: z.string().describe("Base image and build/run steps"),
  fileTree: z.array(z.string()).describe("Planned relative file paths"),
  rationale: z.string(),
  stack: z.object({
    backend: z.string(),
    frontend: z.string(),
    language: z.string(),
    storage: z.string(),
    testFramework: z.string(),
  }),
  stylesheet: z
    .string()
    .describe(
      "Custom design: the one global stylesheet for the UI design tokens, e.g. public/styles/tokens.css. ZT design: the theme file holding the ConfigProvider theme and locale, e.g. src/theme.ts",
    ),
});

/**
 * Technical design only. Visual and interaction design is the UI/UX design
 * agent's job; the two run in parallel from the same PRD.
 */
export const architectureAgent: AgentDefinition<typeof schema> = {
  allowedTools: [],
  buildPrompt: (ctx) => `Design the technical architecture for the PRD below.

The PRD already fixes the product: entities (ENT-xx), screens (S-xx) with their fields, actions, states and permissions, roles and features. Don't redefine them; map them to technology. Your dataModel implements the PRD entities, and your apiEndpoints serve the PRD screens and actions.

Choose whatever web stack best fits the product, constrained to runtimes available in the execution environment and to the application contract. Favour boring, well-known tools with few dependencies: the developer must build it, and the factory must run the tests, quickly and cheaply.

Two other agents are working in parallel from the same PRD:
- A test designer. The test plan will mostly contain HTTP-level API tests, unit tests and a few browser-free end-to-end flows, so pick a test framework that handles HTTP-level tests well, and a test command that runs the whole suite non-interactively and exits non-zero on failure.
${
    ctx.designSystem === "zt"
      ? "- A UI/UX designer, who maps every screen to the ZT Design System (React + Ant Design 6 templates and components). The frontend is therefore fixed: React with antd@6, dayjs and Vite, built in the Dockerfile (a build stage producing static files that the API server serves). Name the theme file (ConfigProvider theme and locale) in stylesheet, and use routes in the style /orders, /orders/:id. Don't make visual decisions beyond that."
      : "- A UI/UX designer, who owns the visual design: design tokens (as CSS custom properties), components, screen layouts. Don't make visual decisions. Do pick a frontend approach that lets one global stylesheet of CSS custom properties style the whole UI, and name that file in stylesheet."
  }

${jsonBlock("PRD", slicePrd(ctx.handoffs.requirements, prdForArchitecture))}`,
  cwd: (ctx) => ctx.stageDir,
  role: "Software Architect",
  runtime: "doc",
  schema,
};
