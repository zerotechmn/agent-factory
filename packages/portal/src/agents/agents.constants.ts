import type { ExpressionId, ShapeId } from "./bloub";
import type { BloubState } from "./components/bloub";

export type AgentLook = { color: string; expression: ExpressionId; name: string; shape: ShapeId };

/**
 * Each agent role gets its own body and colour so it is recognisable at a glance across
 * pages. The expression is its resting personality; the run status overrides it (see
 * `AGENT_MOODS`). Colours are bloub's palette, chosen to read on both light and dark.
 */
export const AGENT_LOOKS: Record<string, AgentLook> = {
  research: { color: "#3b93f0", expression: "curieux", name: "Researcher", shape: "nuage" },
  requirements: { color: "#f0b429", expression: "attentif", name: "Product writer", shape: "squircle" },
  prdReview: { color: "#8b5cf6", expression: "mefiant", name: "Spec checker", shape: "hexagone" },
  testCases: { color: "#2fbfa0", expression: "attentif", name: "Test planner", shape: "capsule" },
  architecture: { color: "#f08a24", expression: "fier", name: "Architect", shape: "triangle" },
  uiDesign: { color: "#e152b0", expression: "heureux", name: "Designer", shape: "goutte" },
  development: { color: "#3ecf8e", expression: "excite", name: "Developer", shape: "cercle" },
  acceptance: { color: "#e8483f", expression: "mefiant", name: "Acceptance tester", shape: "galet" },
  verify: { color: "#a3a3a3", expression: "blase", name: "Verifier", shape: "hexagone" },
  review: { color: "#8b5e3c", expression: "mefiant", name: "Reviewer", shape: "squircle" },
  testing: { color: "#e8483f", expression: "confus", name: "Test fixer", shape: "capsule" },
  deployment: { color: "#3b93f0", expression: "fier", name: "Deployer", shape: "triangle" },
};

/** Stage keys outside the known roles still get a face. */
export const FALLBACK_LOOK: AgentLook = { color: "#a3a3a3", expression: "neutre", name: "Agent", shape: "cercle" };

export type AgentMood = "idle" | "waiting" | "working" | "done" | "failed" | "stopped" | "skipped";

/** Working agents think out loud; finished ones show how it went. `null` keeps the role's own face. */
export const AGENT_MOODS: Record<AgentMood, { expression: ExpressionId | null; play?: BloubState[] }> = {
  done: { expression: "heureux" },
  failed: { expression: "triste" },
  idle: { expression: null },
  skipped: { expression: "blase" },
  stopped: { expression: "blase" },
  waiting: { expression: "somnolent" },
  working: { expression: null, play: ["idle", "thinking", "idle", "wink"] },
};
