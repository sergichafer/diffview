import type { ReactNode } from "react";
import type { AppSettings, OpenRepoResult } from "@/shared/types/app";
import { RepoSessionContext } from "./context";
import { useRepoSessionState } from "./useRepoSession";

interface RepoSessionProviderProps {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  opened?: OpenRepoResult | null;
  openedWorkspaces?: OpenRepoResult[];
  children: ReactNode;
}

export function RepoSessionProvider({
  settings,
  update,
  opened = null,
  openedWorkspaces = [],
  children,
}: RepoSessionProviderProps) {
  const session = useRepoSessionState(settings, update, opened, openedWorkspaces);
  return (
    <RepoSessionContext.Provider value={session}>
      {children}
    </RepoSessionContext.Provider>
  );
}
