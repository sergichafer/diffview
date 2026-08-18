import type { ComparisonStamp } from "@/shared/types/app";

export function stampsMatch(
  row: { mergeBaseOid: string; headOid: string; isLive: boolean },
  stamp: ComparisonStamp,
): boolean {
  return (
    !row.isLive &&
    !stamp.isLive &&
    row.mergeBaseOid === stamp.mergeBase &&
    row.headOid === stamp.headOid
  );
}

export function idleCallback(fn: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(fn);
  } else {
    setTimeout(fn, 0);
  }
}

export const HOT_CAP = 5;
export const CONCURRENT_LOAD_CAP = 3;
