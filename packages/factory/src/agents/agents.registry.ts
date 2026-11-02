import type { AgentStageKey, DesignSystem } from "../pipeline/pipeline.types";
import type { AgentDefinition } from "./agents.shared";
import { architectureAgent } from "./architecture/architecture.agent";
import { deploymentAgent } from "./deployment/deployment.agent";
import { developmentAgent } from "./development/development.agent";
import { requirementsAgent } from "./requirements/requirements.agent";
import { researchAgent } from "./research/research.agent";
import { reviewAgent } from "./review/review.agent";
import { testCasesAgent } from "./test-cases/test-cases.agent";
import { testingAgent } from "./testing/testing.agent";
import { ztUiDesignAgent } from "./ui-design/ui-design-zt.agent";
import { uiDesignAgent } from "./ui-design/ui-design.agent";

export const AGENTS: Record<AgentStageKey, AgentDefinition> = {
  architecture: architectureAgent,
  deployment: deploymentAgent,
  development: developmentAgent,
  requirements: requirementsAgent,
  research: researchAgent,
  review: reviewAgent,
  testCases: testCasesAgent,
  testing: testingAgent,
  uiDesign: uiDesignAgent,
};

/** The agent for a stage in this run; UI/UX design differs by design system. */
export function agentFor(stageKey: AgentStageKey, designSystem: DesignSystem): AgentDefinition {
  if (stageKey === "uiDesign" && designSystem === "zt") return ztUiDesignAgent as AgentDefinition;
  return AGENTS[stageKey];
}
