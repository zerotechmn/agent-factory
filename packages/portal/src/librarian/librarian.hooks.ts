import { useQuery } from "@tanstack/react-query";

import { request } from "../runs/runs.hooks";
import type { LibraryOverview, RunLibrarian } from "./librarian.types";

export const LIBRARIAN_KEYS = {
  overview: ["librarian"] as const,
  run: (id: string) => ["runs", id, "librarian"] as const,
};

export function useLibrarian() {
  return useQuery({ queryFn: () => request<LibraryOverview>("/api/librarian"), queryKey: LIBRARIAN_KEYS.overview });
}

/** Polls while the run works, like the task board: lookups arrive as agents make them. */
export function useRunLibrarian(id: string, { live }: { live: boolean }) {
  return useQuery({
    queryFn: () => request<RunLibrarian>(`/api/runs/${id}/librarian`),
    queryKey: LIBRARIAN_KEYS.run(id),
    refetchInterval: live ? 3_000 : false,
  });
}
