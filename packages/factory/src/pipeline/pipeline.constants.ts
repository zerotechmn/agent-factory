import type { AgentStageKey, DesignSystem, StageSettings } from "./pipeline.types";

const MINUTE = 60_000;
const OPUS = "claude-opus-5-5";
const SONNET = "claude-sonnet-5-5";

// Sonnet handles the document and judgement stages; Opus is kept for the
// stages whose output is code or architecture, where quality pays for itself.
// A straight pass is allocated ~$10.2, leaving ~$3.8 under the $15 cap (after
// the $1 reserve) for repair and fix rounds.
export const STAGE_SETTINGS: Record<AgentStageKey, StageSettings> = {
  deployment: {
    budgetUsd: 0.75,
    effort: "medium",
    label: "Deployment repair",
    maxTurns: 40,
    minUsd: 0.25,
    model: SONNET,
    skills: [],
    timeoutMs: 20 * MINUTE,
  },
  architecture: {
    budgetUsd: 0.8,
    effort: "high",
    label: "Architecture",
    maxTurns: 20,
    minUsd: 0.25,
    model: OPUS,
    skills: [],
    timeoutMs: 10 * MINUTE,
  },
  development: {
    budgetUsd: 7.0,
    effort: "high",
    label: "Development",
    maxTurns: 250,
    minUsd: 1.0,
    model: OPUS,
    skills: [
      "factory:test-driven-development",
      "factory:verification-before-completion",
      "factory:frontend-design",
      "factory:web-interface-guidelines",
    ],
    timeoutMs: 45 * MINUTE,
  },
  requirements: {
    // The PRD template is far richer than a story list, so more output tokens.
    budgetUsd: 0.6,
    effort: "medium",
    label: "Requirements",
    maxTurns: 10,
    minUsd: 0.1,
    model: SONNET,
    skills: [],
    timeoutMs: 5 * MINUTE,
  },
  research: {
    budgetUsd: 0.4,
    effort: "medium",
    label: "Research",
    maxTurns: 20,
    minUsd: 0.15,
    model: SONNET,
    skills: [],
    timeoutMs: 8 * MINUTE,
  },
  review: {
    budgetUsd: 0.5,
    effort: "medium",
    label: "Review",
    maxTurns: 60,
    minUsd: 0.2,
    model: SONNET,
    skills: ["factory:web-interface-guidelines"],
    timeoutMs: 15 * MINUTE,
  },
  testCases: {
    budgetUsd: 0.3,
    effort: "medium",
    label: "Test cases",
    maxTurns: 10,
    minUsd: 0.1,
    model: SONNET,
    skills: [],
    timeoutMs: 5 * MINUTE,
  },
  uiDesign: {
    budgetUsd: 0.6,
    // Medium: the visual thinking happens in the skill's two-pass process; high
    // effort mostly added thinking tokens to an already output-heavy stage.
    effort: "medium",
    label: "UI/UX design",
    maxTurns: 10,
    minUsd: 0.2,
    model: OPUS,
    skills: ["factory:frontend-design"],
    timeoutMs: 10 * MINUTE,
  },
  testing: {
    budgetUsd: 0.75,
    effort: "medium",
    label: "Test triage",
    maxTurns: 80,
    minUsd: 0.25,
    model: SONNET,
    skills: ["factory:systematic-debugging"],
    timeoutMs: 20 * MINUTE,
  },
};

/** One resumed requirements session to fix PRD cross-reference problems. */
export const PRD_REPAIR_BUDGET_USD = 0.3;

/** A development fix round: resumes the developer's session, so it needs less than the first build. */
export const FIX_BUDGET_USD = 1.5;

/** Fix rounds add root-cause debugging to the developer's usual skills. */
export const FIX_SKILLS = [...STAGE_SETTINGS.development.skills, "factory:systematic-debugging"];

/**
 * Held back so a broken container can still be repaired after an early stop.
 * Smaller than before: the verify gate deploys for free, so the reserve only
 * funds a repair agent, which most runs never need.
 */
export const DEPLOY_RESERVE_USD = 1.0;

/** Verify → repair/fix rounds after the first verify. */
export const MAX_FIX_ATTEMPTS = 2;

/** Port every generated app must listen on inside its container (overridable via $PORT). */
export const APP_PORT = 8080;

export const VERIFY_LABEL = "Verify";

/** Install + test command limit inside the verify gate. */
export const VERIFY_TESTS_TIMEOUT_MS = 10 * MINUTE;

const ZT_SKILL = "factory:zt-design-system";

/**
 * On ZT runs the ZT Design System replaces frontend-design wherever that is
 * used (it says "read only this file"), and review checks against it too.
 * Custom-design runs keep the configured skills.
 */
export function skillsFor(stageKey: AgentStageKey, designSystem: DesignSystem, skills: string[]): string[] {
  if (designSystem !== "zt") return skills;
  const swapped = skills.map((skill) => (skill === "factory:frontend-design" ? ZT_SKILL : skill));
  if (stageKey === "review" && !swapped.includes(ZT_SKILL)) swapped.push(ZT_SKILL);
  return swapped;
}
