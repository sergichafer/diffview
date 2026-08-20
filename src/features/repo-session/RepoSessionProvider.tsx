import type { ReactNode } from "react";
import type { AppSettings, OpenRepoResult } from "@/shared/types/app";
import { RepoSessionContext } from "./context";
import { useRepoSessionState } from "./useRepoSession";

interface RepoSessionProviderProps {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  opened?: OpenRepoResult | null;
  openedWorkspaces?: OpenRepoResult[];
  openedFromCli?: boolean;
  children: ReactNode;
}

export function RepoSessionProvider({
  settings,
  update,
  opened = null,
  openedWorkspaces = [],
  openedFromCli = false,
  children,
}: RepoSessionProviderProps) {
  const session = useRepoSessionState(
    settings,
    update,
    opened,
    openedWorkspaces,
    openedFromCli,
  );
  return (
    <RepoSessionContext.Provider value={session}>
      {children}
    </RepoSessionContext.Provider>
  );
}
