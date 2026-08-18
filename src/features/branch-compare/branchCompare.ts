export type CompareSlot = "head" | "base";

/** Repo branches only. Selection must never manufacture or remove options. */
export function branchOptionNames(branches: readonly string[]): string[] {
  return Array.from(branches);
}

/**
 * Picking the other slot's branch swaps the pair so head and base never collapse.
 */
export function applyBranchPick(
  slot: CompareSlot,
  name: string,
  current: { head: string; base: string },
): { head: string; base: string } {
  const { head, base } = current;
  if (slot === "head") {
    if (name === head) return { head, base };
    if (name === base) return { head: base, base: head };
    return { head: name, base };
  }
  if (name === base) return { head, base };
  if (name === head) return { head: base, base: head };
  return { head, base: name };
}
