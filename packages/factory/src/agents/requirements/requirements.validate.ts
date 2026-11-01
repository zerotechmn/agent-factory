import type { Prd } from "./requirements.schema";

const ID_FORMATS = {
  businessRule: /^BRL-\d{2,}$/,
  decision: /^OQ-\d{2,}$/,
  entity: /^ENT-\d{2,}$/,
  feature: /^F-\d{2,}$/,
  nonFunctional: /^NFR-\d{2,}$/,
  notification: /^N-\d{2,}$/,
  referenceSystem: /^REF-\d{2,}$/,
  report: /^R-\d{2,}$/,
  screen: /^S-\d{2,}$/,
} as const;

/**
 * Cross-reference checks the JSON schema can't express: id formats, unique
 * ids, and every F-/S-/BRL-/role reference pointing at something that
 * exists. Costs nothing, and an inconsistent PRD caught here is far cheaper
 * than the design and fix rounds it would otherwise send off course.
 *
 * Returns human-readable problems; an empty list means the PRD is consistent.
 */
export function validatePrd(prd: Prd): string[] {
  const issues: string[] = [];

  const featureIds = collect(issues, "feature", ID_FORMATS.feature, prd.features.map((f) => f.id));
  const screenIds = collect(issues, "screen", ID_FORMATS.screen, prd.screens.map((s) => s.id));
  const ruleIds = collect(issues, "business rule", ID_FORMATS.businessRule, prd.businessRules.map((r) => r.id));
  const reportIds = collect(issues, "report", ID_FORMATS.report, prd.reports.map((r) => r.id));
  collect(issues, "entity", ID_FORMATS.entity, prd.entities.map((e) => e.id));
  collect(issues, "non-functional requirement", ID_FORMATS.nonFunctional, prd.nonFunctional.map((n) => n.id));
  collect(issues, "notification", ID_FORMATS.notification, prd.notifications.map((n) => n.id));
  collect(issues, "reference system", ID_FORMATS.referenceSystem, prd.referenceSystems.map((r) => r.id));
  collect(issues, "open question", ID_FORMATS.decision, prd.decisions.map((d) => d.id));
  const roles = new Set(prd.roles.map((r) => r.name));

  const acIds = new Set<string>();
  for (const feature of prd.features) {
    for (const ac of feature.acceptanceCriteria) {
      // AC-F03-02 belongs to F-03: the id itself must say which feature it tests.
      const expectedPrefix = `AC-${feature.id.replace("-", "")}-`;
      if (!ac.id.startsWith(expectedPrefix) || !/^AC-F\d{2,}-\d{2,}$/.test(ac.id)) {
        issues.push(`${ac.id}: acceptance criterion of ${feature.id} must be named ${expectedPrefix}yy`);
      }
      if (acIds.has(ac.id)) issues.push(`${ac.id}: duplicate acceptance criterion id`);
      acIds.add(ac.id);
    }
    refs(issues, feature.id, "screen", feature.screenIds, screenIds);
    refs(issues, feature.id, "business rule", feature.ruleIds, ruleIds);
  }

  for (const screen of prd.screens) {
    refs(issues, screen.id, "feature", screen.featureIds, featureIds);
    refs(issues, screen.id, "role", screen.roles, roles);
    refs(issues, screen.id, "role", screen.permissions.map((p) => p.role), roles);
    for (const action of screen.actions) {
      if (action.featureId) refs(issues, `${screen.id} action "${action.label}"`, "feature", [action.featureId], featureIds);
      refs(issues, `${screen.id} action "${action.label}"`, "business rule", action.rules.match(/BRL-\d+/g) ?? [], ruleIds);
    }
    for (const permission of screen.permissions) {
      const labels = new Set(screen.actions.map((a) => a.label));
      for (const action of permission.actions) {
        if (!labels.has(action)) issues.push(`${screen.id}: role ${permission.role} is granted unknown action "${action}"`);
      }
    }
    if (!prd.features.some((f) => f.screenIds.includes(screen.id))) {
      issues.push(`${screen.id}: no feature lists this screen`);
    }
  }

  const appliesToTargets = new Set([...featureIds, ...screenIds, ...reportIds]);
  for (const rule of prd.businessRules) {
    if (rule.appliesTo.length === 0) issues.push(`${rule.id}: applies to nothing`);
    refs(issues, rule.id, "feature/screen/report", rule.appliesTo, appliesToTargets);
  }

  for (const permission of prd.permissions) {
    const where = `permission ${permission.featureId} × ${permission.role}`;
    refs(issues, where, "feature", [permission.featureId], featureIds);
    refs(issues, where, "role", [permission.role], roles);
    if (permission.ruleId) refs(issues, where, "business rule", [permission.ruleId], ruleIds);
  }

  for (const report of prd.reports) refs(issues, report.id, "role", report.roles, roles);

  return issues;
}

function collect(issues: string[], kind: string, format: RegExp, values: string[]): Set<string> {
  const seen = new Set<string>();
  for (const value of values) {
    if (!format.test(value)) issues.push(`${value}: not a valid ${kind} id`);
    if (seen.has(value)) issues.push(`${value}: duplicate ${kind} id`);
    seen.add(value);
  }
  return seen;
}

function refs(issues: string[], where: string, kind: string, values: string[], known: Set<string>): void {
  for (const value of values) {
    if (!known.has(value)) issues.push(`${where}: references unknown ${kind} ${value}`);
  }
}
