import type { ComparisonKey } from "@/features/branch-compare/comparisonKey";

export function mostRecentKeyInGroup(
  mruKeys: readonly ComparisonKey[],
  comparisonKeys: readonly ComparisonKey[],
): ComparisonKey | undefined {
  if (comparisonKeys.length === 0) return undefined;
  const inGroup = new Set(comparisonKeys);
  return mruKeys.find((k) => inGroup.has(k)) ?? comparisonKeys[0];
}
