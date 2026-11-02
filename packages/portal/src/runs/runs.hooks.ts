import { useMutation, useQuery } from "@tanstack/react-query";

import { TERMINAL_STATUSES } from "./runs.constants";
import type { Board, DesignSystem, Envelope, Run } from "./runs.types";

export const RUN_KEYS = {
  board: (id: string) => ["runs", id, "board"] as const,
  detail: (id: string) => ["runs", id] as const,
  report: (id: string, dirName: string) => ["runs", id, "report", dirName] as const,
};

export function useRun(id: string) {
  return useQuery({
    queryFn: () => request<Run>(`/api/runs/${id}`),
    queryKey: RUN_KEYS.detail(id),
    // Poll until the run reaches a terminal state.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_STATUSES.includes(status) ? false : 2_000;
    },
  });
}

/** Polls with the run: cards move while agents work. */
export function useBoard(id: string, { live }: { live: boolean }) {
  return useQuery({
    queryFn: () => request<Board>(`/api/runs/${id}/board`),
    queryKey: RUN_KEYS.board(id),
    refetchInterval: live ? 2_000 : false,
  });
}

export function useStageReport(id: string, dirName: string | null) {
  return useQuery({
    enabled: dirName !== null,
    queryFn: () => request<{ dirName: string; markdown: string }>(`/api/runs/${id}/stages/${dirName}/report`),
    queryKey: RUN_KEYS.report(id, dirName ?? ""),
  });
}

export function useCreateRun() {
  return useMutation({
    mutationFn: ({ designSystem, prompt }: { designSystem: DesignSystem; prompt: string }) =>
      request<{ id: string }>("/api/runs", {
        body: JSON.stringify({ designSystem, prompt }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
  });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !body) throw new Error(body?.message ?? `Request failed (${response.status})`);
  return body.data;
}
