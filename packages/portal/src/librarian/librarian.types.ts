export type LessonStep = "tests" | "build" | "run" | "health" | "smoke" | "ui" | "acceptance" | "review";

export type Lesson = {
  designSystem: "zt" | "custom";
  fix: string;
  id: number;
  problem: string;
  rootCause: string;
  /** Builds in which the same problem was fixed and proven. */
  seen: number;
  step: LessonStep;
  tags: string[];
};

export type LibraryOverview = {
  catalog: { files: number; name: string; summary: string; tags: string[] }[];
  docs: { library: string; sections: number }[];
  lessons: (Lesson & { updatedAt: string })[];
  totals: { docSections: number; lessons: number; lookups: number; lookupsWithHits: number; pushes: number; runs: number };
};

export type LibrarianEvent = {
  at: string;
  hits: number;
  id: number;
  query: string;
  results: { ref: string; title: string }[];
  stage: string;
  tool: string;
};

export type LibrarianStat = { auto: number; capped: number; pulls: number; stage: string; withHits: number };

export type RunLibrarian = { events: LibrarianEvent[]; lessonsLearned: Lesson[]; stats: LibrarianStat[] };
