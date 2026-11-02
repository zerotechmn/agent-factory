import { asPrd } from "../requirements/requirements.utils";
import type { Prd } from "../requirements/requirements.schema";

// The developer builds a larger app in parts: a scaffold, one fresh session
// per feature group, and a finish. Each feature session sees only its own
// slice of the spec, so its context starts small and stays small, instead of
// re-reading every earlier feature's code and tool output on every turn.

type Feature = Prd["features"][number];
type TestCase = { acceptanceCriterionIds: string[]; id: string } & Record<string, unknown>;
type Endpoint = { operationId: string; servesScreens: string[] } & Record<string, unknown>;

export type DevSlice = {
  /** Its feature ids joined, e.g. "F-02+F-03"; also the stage label suffix and resume key. */
  id: string;
  endpoints: Endpoint[];
  entities: Prd["entities"];
  featureIds: string[];
  features: Feature[];
  rules: Prd["businessRules"];
  screenIds: string[];
  screens: Prd["screens"];
  testCases: TestCase[];
  /** The UI design's entries for this slice's screens. */
  uiScreens: unknown[];
};

export type DevPart = { kind: "scaffold" } | { kind: "feature"; slice: DevSlice } | { kind: "finish" };

/** More sessions than this cost more in start-up and code re-reading than the smaller contexts save. */
export const MAX_SLICES = 6;

const PRIORITY_ORDER: Record<Feature["priority"], number> = { Could: 2, Must: 0, Should: 1 };

/**
 * Splits the PRD into feature groups to build one per session, or returns
 * null when the app is too small for that to pay off. Features that share a
 * screen go together: they edit the same UI files, and building them in
 * separate sessions would make the second undo or fight the first.
 */
export function planSlices({
  architecture,
  minSlices,
  prd: prdHandoff,
  testPlan,
  uiDesign,
}: {
  architecture: unknown;
  minSlices: number;
  prd: unknown;
  testPlan: unknown;
  uiDesign: unknown;
}): DevSlice[] | null {
  const prd = asPrd(prdHandoff);
  if (!prd || prd.features.length === 0) return null;

  const ordered = [...prd.features].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || prd.features.indexOf(a) - prd.features.indexOf(b),
  );
  let groups = groupBySharedScreens(ordered, prd.screens);
  while (groups.length > MAX_SLICES) groups = mergeSmallestNeighbours(groups);
  if (groups.length < minSlices) return null;

  const tests = asList<TestCase>((testPlan as { testCases?: unknown } | null)?.testCases).filter((t) => Array.isArray(t.acceptanceCriterionIds));
  const endpoints = asList<Endpoint>((architecture as { apiEndpoints?: unknown } | null)?.apiEndpoints).filter((e) =>
    Array.isArray(e.servesScreens),
  );
  const designScreens = asList<Record<string, unknown>>((uiDesign as { screens?: unknown } | null)?.screens);

  return groups.map((features) => {
    const featureIds = features.map((f) => f.id);
    const screenIds = unique([
      ...features.flatMap((f) => f.screenIds),
      ...prd.screens.filter((s) => s.featureIds.some((id) => featureIds.includes(id))).map((s) => s.id),
    ]);
    const criteria = new Set(features.flatMap((f) => f.acceptanceCriteria.map((ac) => ac.id)));
    const ruleIds = new Set(features.flatMap((f) => f.ruleIds));
    const screens = prd.screens.filter((s) => screenIds.includes(s.id));
    // Fields name their source as entity.field, e.g. "order.created_at".
    const entityNames = new Set(screens.flatMap((s) => s.fields.map((f) => f.source.split(".")[0]!.toLowerCase())));
    return {
      endpoints: endpoints.filter((e) => e.servesScreens.some((id) => screenIds.includes(id))),
      entities: prd.entities.filter((e) => entityNames.has(e.name.toLowerCase())),
      featureIds,
      features,
      id: featureIds.join("+"),
      rules: prd.businessRules.filter((r) => ruleIds.has(r.id) || r.appliesTo.some((x) => featureIds.includes(x) || screenIds.includes(x))),
      screenIds,
      screens,
      testCases: tests.filter((t) => t.acceptanceCriterionIds.some((ac) => criteria.has(ac))),
      uiScreens: designScreens.filter((s) => screenIds.includes(String(s.screenId ?? s.id ?? ""))),
    };
  });
}

export type DevHandoff = {
  buildVerified?: boolean;
  commands?: { install: string; start: string; test: string };
  filesChanged?: string[];
  knownGaps?: string[];
  lessons?: unknown[];
  notes?: string;
  screens?: { note: string; path: string | null; screenId: string }[];
  testsWritten?: string[];
};

/**
 * One development handoff from the parts, in the shape verify, review and
 * fix rounds already read: the latest commands, the latest path per screen,
 * and everything written, changed or missing across all parts.
 */
export function mergeDevHandoffs(parts: DevHandoff[], { extraGaps = [] }: { extraGaps?: string[] } = {}): DevHandoff {
  const screens = new Map<string, NonNullable<DevHandoff["screens"]>[number]>();
  for (const part of parts) for (const screen of part.screens ?? []) screens.set(screen.screenId, screen);
  const last = parts.at(-1);
  return {
    buildVerified: Boolean(last?.buildVerified),
    commands: [...parts].reverse().find((p) => p.commands)?.commands,
    filesChanged: unique(parts.flatMap((p) => p.filesChanged ?? [])),
    knownGaps: unique([...parts.flatMap((p) => p.knownGaps ?? []), ...extraGaps]),
    lessons: parts.flatMap((p) => p.lessons ?? []),
    notes: parts.map((p) => p.notes).filter(Boolean).join("\n\n") || undefined,
    screens: [...screens.values()],
    testsWritten: unique(parts.flatMap((p) => p.testsWritten ?? [])),
  };
}

/** Splits the development pool: fixed amounts for scaffold and finish, the rest shared by the feature sessions. */
export function sliceBudgets({ count, poolUsd }: { count: number; poolUsd: number }): { featureUsd: number; finishUsd: number; scaffoldUsd: number } {
  const scaffoldUsd = 1.5;
  const finishUsd = 1.0;
  const share = (poolUsd - scaffoldUsd - finishUsd) / Math.max(count, 1);
  return { featureUsd: Math.round(Math.min(Math.max(share, 0.8), 2.0) * 100) / 100, finishUsd, scaffoldUsd };
}

/** Union-find over features: two features share a group when they share a screen. */
function groupBySharedScreens(features: Feature[], screens: Prd["screens"]): Feature[][] {
  const parent = features.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const screensOf = (f: Feature) => new Set([...f.screenIds, ...screens.filter((s) => s.featureIds.includes(f.id)).map((s) => s.id)]);
  const sets = features.map(screensOf);
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      if ([...sets[i]!].some((s) => sets[j]!.has(s))) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, Feature[]>();
  features.forEach((f, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), f]));
  // Groups keep the order of their first (highest-priority) feature.
  return [...groups.values()];
}

/** Merges the smallest group into its smaller neighbour, keeping build order. */
function mergeSmallestNeighbours(groups: Feature[][]): Feature[][] {
  const sizes = groups.map((g) => g.length);
  const i = sizes.indexOf(Math.min(...sizes));
  const j = i === 0 ? 1 : i === groups.length - 1 ? i - 1 : sizes[i - 1]! <= sizes[i + 1]! ? i - 1 : i + 1;
  const [a, b] = [Math.min(i, j), Math.max(i, j)];
  return [...groups.slice(0, a), [...groups[a]!, ...groups[b]!], ...groups.slice(b + 1)];
}

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
