import type { Residency } from "./types";

export type StalenessInput = {
  isLive: boolean;
  outdated: boolean;
  residency: Residency;
  hasFileDiffs: boolean;
  isActive: boolean;
};

export type PreStampDecision = "load" | "skip" | "check-stamp";
export type PostStampDecision = "load" | "skip" | "mark-outdated-load";

export function decideBeforeStamp(input: StalenessInput): PreStampDecision {
  if (input.isLive || input.outdated) return "load";
  if (input.residency === "hot" && input.hasFileDiffs) return "skip";
  return "check-stamp";
}

export function decideAfterStamp(
  input: StalenessInput & { stampsMatch: boolean },
): PostStampDecision {
  if (input.stampsMatch && input.residency !== "cold" && !input.outdated) {
    return input.residency === "warm" || input.isActive ? "load" : "skip";
  }
  if (input.stampsMatch && input.residency === "hot") return "skip";
  if (!input.stampsMatch) return "mark-outdated-load";
  return "load";
}
