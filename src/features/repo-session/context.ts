/**
 * Public `useRepoSession` + context. App wiring imports from here.
 * ComparisonKey: `src/features/branch-compare/comparisonKey.ts`
 * ComparisonRow / WorkspaceGroup: `./types`
 * RepoSessionValue: `./useRepoSession`
 */
import { createContext, use } from "react";
import type { RepoSessionValue } from "./useRepoSession";

export const RepoSessionContext = createContext<RepoSessionValue | null>(null);

export function useRepoSession(): RepoSessionValue {
  const ctx = use(RepoSessionContext);
  if (!ctx) {
    throw new Error("useRepoSession must be used within RepoSessionProvider");
  }
  return ctx;
}
