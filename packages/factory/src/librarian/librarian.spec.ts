import { asPrd } from "../agents/requirements/requirements.utils";
import type { BoardColumn } from "../board/board.types";
import type { AgentStageKey } from "../pipeline/pipeline.types";

// Pure lookups over the run's handoffs. Agents already get these specs inline;
// this answers the questions that need a search across them ("which tests
// cover AC-F03-02?", "what calls this screen?") without re-reading the blobs.

type Handoffs = Partial<Record<AgentStageKey, unknown>>;

type TestCase = { acceptanceCriterionIds: string[]; id: string; title: string };
type Endpoint = { method: string; operationId: string; path: string; servesScreens: string[] };

export type SpecHit = { id: string; item: unknown; kind: string };

export type SpecTrace = {
  /** Board column per linked id that has a card (features, screens, tests, smoke checks). */
  columns: Record<string, BoardColumn>;
  id: string;
  kind: string;
  links: Partial<Record<"acceptanceCriteria" | "endpoints" | "features" | "rules" | "screens" | "tests", string[]>>;
};

/** Finds one item by id across the PRD, test plan and architecture; ids match with or without leading zeros. */
export function lookupSpec(handoffs: Handoffs, rawId: string): SpecHit | null {
  const id = canonical(rawId);
  const prd = asPrd(handoffs.requirements);
  if (prd) {
    for (const feature of prd.features) {
      if (canonical(feature.id) === id) return { id: feature.id, item: feature, kind: "feature" };
      const criterion = feature.acceptanceCriteria.find((ac) => canonical(ac.id) === id);
      if (criterion) return { id: criterion.id, item: { ...criterion, featureId: feature.id }, kind: "acceptanceCriterion" };
    }
    const groups: [string, { id: string }[]][] = [
      ["screen", prd.screens],
      ["businessRule", prd.businessRules],
      ["entity", prd.entities],
      ["nonFunctional", prd.nonFunctional],
      ["notification", prd.notifications],
      ["report", prd.reports],
      ["decision", prd.decisions],
      ["referenceSystem", prd.referenceSystems],
    ];
    for (const [kind, items] of groups) {
      const item = items.find((candidate) => canonical(candidate.id) === id);
      if (item) return { id: item.id, item, kind };
    }
    const role = prd.roles.find((r) => r.name.toLowerCase() === rawId.trim().toLowerCase());
    if (role) {
      return { id: role.name, item: { ...role, permissions: prd.permissions.filter((p) => p.role === role.name) }, kind: "role" };
    }
  }

  const plan = asRecord(handoffs.testCases);
  for (const [kind, key] of [["testCase", "testCases"], ["smokeCheck", "smokeChecks"]] as const) {
    const item = asIdList(plan?.[key]).find((candidate) => canonical(candidate.id) === id);
    if (item) return { id: item.id, item, kind };
  }

  // Endpoints have no id of their own; the architecture names them by operationId.
  const endpoint = endpoints(handoffs).find((e) => e.operationId.toLowerCase() === rawId.trim().toLowerCase());
  if (endpoint) return { id: endpoint.operationId, item: endpoint, kind: "endpoint" };
  return null;
}

/** What an item is connected to, following the PRD's and test plan's own id references. */
export function traceSpec(handoffs: Handoffs, columns: Map<string, BoardColumn>, rawId: string): SpecTrace | null {
  const hit = lookupSpec(handoffs, rawId);
  if (!hit) return null;
  const prd = asPrd(handoffs.requirements);
  const tests = testCases(handoffs);
  const links: SpecTrace["links"] = {};
  const testsFor = (criterionIds: string[]) =>
    tests.filter((t) => t.acceptanceCriterionIds.some((ac) => criterionIds.some((c) => canonical(c) === canonical(ac)))).map((t) => t.id);
  const featureOfCriterion = (criterionId: string) =>
    prd?.features.find((f) => f.acceptanceCriteria.some((ac) => canonical(ac.id) === canonical(criterionId)))?.id;

  if (hit.kind === "feature" && prd) {
    const feature = prd.features.find((f) => f.id === hit.id)!;
    const criterionIds = feature.acceptanceCriteria.map((ac) => ac.id);
    links.acceptanceCriteria = criterionIds;
    links.rules = feature.ruleIds;
    links.screens = unique([...feature.screenIds, ...prd.screens.filter((s) => s.featureIds.includes(feature.id)).map((s) => s.id)]);
    links.tests = testsFor(criterionIds);
  }
  if (hit.kind === "acceptanceCriterion") {
    links.features = compact([featureOfCriterion(hit.id)]);
    links.tests = testsFor([hit.id]);
  }
  if (hit.kind === "testCase") {
    const test = tests.find((t) => t.id === hit.id)!;
    links.acceptanceCriteria = test.acceptanceCriterionIds;
    links.features = unique(compact(test.acceptanceCriterionIds.map(featureOfCriterion)));
  }
  if (hit.kind === "screen" && prd) {
    const screen = prd.screens.find((s) => s.id === hit.id)!;
    links.features = unique([...screen.featureIds, ...prd.features.filter((f) => f.screenIds.includes(screen.id)).map((f) => f.id)]);
    links.rules = unique(screen.actions.flatMap((a) => a.rules.match(/BRL-\d+/g) ?? []));
    links.endpoints = endpoints(handoffs)
      .filter((e) => e.servesScreens.includes(screen.id))
      .map((e) => `${e.operationId} (${e.method} ${e.path})`);
  }
  if (hit.kind === "businessRule" && prd) {
    const rule = prd.businessRules.find((r) => r.id === hit.id)!;
    links.features = unique([...rule.appliesTo.filter((x) => /^F-/.test(x)), ...prd.features.filter((f) => f.ruleIds.includes(rule.id)).map((f) => f.id)]);
    links.screens = rule.appliesTo.filter((x) => /^S-/.test(x));
  }
  if (hit.kind === "endpoint") links.screens = (hit.item as Endpoint).servesScreens;

  const linked = [hit.id, ...Object.values(links).flat()];
  const boardColumns: Record<string, BoardColumn> = {};
  for (const linkedId of linked) {
    const column = columns.get(linkedId);
    if (column) boardColumns[linkedId] = column;
  }
  return { columns: boardColumns, id: hit.id, kind: hit.kind, links };
}

/** "AC-F03-02" and "ac-f3-2" are the same id; agents and PRDs aren't consistent about zero padding. */
export function canonical(id: string): string {
  return id.trim().toUpperCase().replace(/(^|\D)0+(\d)/g, "$1$2");
}

function testCases(handoffs: Handoffs): TestCase[] {
  return asIdList(asRecord(handoffs.testCases)?.testCases).filter((t): t is TestCase & { id: string } =>
    Array.isArray((t as Partial<TestCase>).acceptanceCriterionIds),
  ) as TestCase[];
}

function endpoints(handoffs: Handoffs): Endpoint[] {
  const list = asRecord(handoffs.architecture)?.apiEndpoints;
  return Array.isArray(list) ? list.filter((e): e is Endpoint => typeof (e as Partial<Endpoint>)?.operationId === "string") : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asIdList(value: unknown): ({ id: string } & Record<string, unknown>)[] {
  return Array.isArray(value) ? value.filter((v) => typeof (v as { id?: unknown })?.id === "string") : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function compact(values: (string | undefined)[]): string[] {
  return values.filter((v): v is string => Boolean(v));
}
