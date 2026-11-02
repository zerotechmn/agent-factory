import type { Prd } from "./requirements.schema";

// The full PRD is large and every token of it is re-read on each turn of an
// agent's session. Each downstream agent gets only the sections it acts on;
// the developer, who builds everything, is the only one that gets it all.

/** Test designer: what must be proven, and the rules and states that create edge cases. */
export function prdForTestCases(prd: Prd) {
  return {
    businessRules: prd.businessRules,
    features: prd.features.map(({ acceptanceCriteria, id, name, ruleIds }) => ({ acceptanceCriteria, id, name, ruleIds })),
    nonFunctional: prd.nonFunctional,
    permissions: prd.permissions,
    roles: prd.roles,
    screens: prd.screens.map(({ fields, id, name, states }) => ({ fields, id, name, states })),
  };
}

/** Architect: the shape of the system, not the behavioural or visual detail. */
export function prdForArchitecture(prd: Prd) {
  return {
    constraints: prd.constraints,
    entities: prd.entities,
    features: prd.features.map(({ description, id, name, priority, screenIds }) => ({ description, id, name, priority, screenIds })),
    nonFunctional: prd.nonFunctional,
    notifications: prd.notifications,
    objective: prd.objective,
    reports: prd.reports,
    roles: prd.roles,
    screens: prd.screens.map(({ actions, featureIds, fields, id, name }) => ({ actions, featureIds, fields, id, name })),
    title: prd.title,
  };
}

/** UI/UX designer: who uses which screens, and everything a screen shows or does. */
export function prdForUiDesign(prd: Prd) {
  return {
    features: prd.features.map(({ description, id, name, userFlow }) => ({ description, id, name, userFlow })),
    nonFunctional: prd.nonFunctional,
    objective: prd.objective,
    referenceSystems: prd.referenceSystems,
    roles: prd.roles,
    screens: prd.screens,
    title: prd.title,
  };
}

/** Reviewer: what the code must do, to check it against. */
export function prdForReview(prd: Prd) {
  return {
    businessRules: prd.businessRules,
    features: prd.features.map(({ acceptanceCriteria, id, name }) => ({ acceptanceCriteria, id, name })),
    nonFunctional: prd.nonFunctional,
    permissions: prd.permissions,
  };
}

/** Handoffs are untyped across stages; a missing or failed requirements stage yields null. */
export function asPrd(handoff: unknown): Prd | null {
  return handoff && typeof handoff === "object" && "features" in handoff ? (handoff as Prd) : null;
}

/** Applies a slice when the handoff is a PRD; passes anything else through unchanged. */
export function slicePrd<T>(handoff: unknown, slice: (prd: Prd) => T): T | unknown {
  const prd = asPrd(handoff);
  return prd ? slice(prd) : handoff;
}
