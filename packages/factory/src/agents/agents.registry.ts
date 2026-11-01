import type { StageKey } from "../pipeline/pipeline.types";
import type { AgentDefinition } from "./agents.shared";
import { deploymentAgent } from "./deployment/deployment.agent";
import { designAgent } from "./design/design.agent";
import { developmentAgent } from "./development/development.agent";
import { requirementsAgent } from "./requirements/requirements.agent";
import { reviewAgent } from "./review/review.agent";
import { testCasesAgent } from "./test-cases/test-cases.agent";
import { testingAgent } from "./testing/testing.agent";

export const AGENTS: Record<StageKey, AgentDefinition> = {
  deployment: deploymentAgent,
  design: designAgent,
  development: developmentAgent,
  requirements: requirementsAgent,
  review: reviewAgent,
  testCases: testCasesAgent,
  testing: testingAgent,
};
