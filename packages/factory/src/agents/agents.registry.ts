import type { AgentStageKey } from "../pipeline/pipeline.types";
import type { AgentDefinition } from "./agents.shared";
import { deploymentAgent } from "./deployment/deployment.agent";
import { designAgent } from "./design/design.agent";
import { developmentAgent } from "./development/development.agent";
import { requirementsAgent } from "./requirements/requirements.agent";
import { researchAgent } from "./research/research.agent";
import { reviewAgent } from "./review/review.agent";
import { testCasesAgent } from "./test-cases/test-cases.agent";
import { testingAgent } from "./testing/testing.agent";

export const AGENTS: Record<AgentStageKey, AgentDefinition> = {
  deployment: deploymentAgent,
  design: designAgent,
  development: developmentAgent,
  requirements: requirementsAgent,
  research: researchAgent,
  review: reviewAgent,
  testCases: testCasesAgent,
  testing: testingAgent,
};
