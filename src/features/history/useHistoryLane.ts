import { useEffect, useState } from "react";
import { api } from "@/shared/tauri/api";
import type { HistoryLane as HistoryLaneData } from "@/shared/types/app";

export const historyLaneClient = {
  load(repoPath: string, base: string, head: string): Promise<HistoryLaneData> {
    return api.getHistoryLane(repoPath, base, head);
  },
};

type LaneStatus = "idle" | "loading" | "ready" | "error";

type LaneState = {
  generation: number;
  repoPath: string;
  base: string;
  head: string;
  status: Exclude<LaneStatus, "idle">;
  lane: HistoryLaneData | null;
};

export function useHistoryLane(
  repoPath: string,
  base: string,
  head: string,
  enabled: boolean,
): { lane: HistoryLaneData | null; status: LaneStatus } {
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  const [generation, setGeneration] = useState(0);
  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled);
    if (enabled) setGeneration((current) => current + 1);
  }

  const [state, setState] = useState<LaneState | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const request = { generation, repoPath, base, head };
    setState({ ...request, status: "loading", lane: null });
    historyLaneClient.load(repoPath, base, head).then(
      (lane) => {
        if (!cancelled) setState({ ...request, status: "ready", lane });
      },
      () => {
        if (!cancelled) setState({ ...request, status: "error", lane: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, generation, repoPath, base, head]);

  if (!enabled) return { lane: null, status: "idle" };
  const current =
    state &&
    state.generation === generation &&
    state.repoPath === repoPath &&
    state.base === base &&
    state.head === head
      ? state
      : null;
  if (!current || current.status === "loading") {
    return { lane: null, status: "loading" };
  }
  if (current.status === "error") return { lane: null, status: "error" };
  return { lane: current.lane, status: "ready" };
}
