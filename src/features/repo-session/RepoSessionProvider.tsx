import type { ReactNode } from "react";
import type { AppSettings, OpenRepoResult } from "@/shared/types/app";
import { RepoSessionContext } from "./context";
import { useRepoSessionState } from "./useRepoSession";

interface RepoSessionProviderProps {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  opened?: OpenRepoResult | null;
  openedWorkspaces?: OpenRepoResult[];
  cliOpenedPaths?: string[];
  cliRemoteUrls?: string[];
  children: ReactNode;
}

export function RepoSessionProvider({
  settings,
  update,
  opened = null,
  openedWorkspaces = [],
  cliOpenedPaths = [],
  cliRemoteUrls = [],
  children,
}: RepoSessionProviderProps) {
  const session = useRepoSessionState(
    settings,
    update,
    opened,
    openedWorkspaces,
    cliOpenedPaths,
    cliRemoteUrls,
  );
  return (
    <RepoSessionContext.Provider value={session}>
      {children}
    </RepoSessionContext.Provider>
  );
}
