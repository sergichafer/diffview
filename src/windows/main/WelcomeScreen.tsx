import { open } from "@tauri-apps/plugin-dialog";
import { IconButton } from "@/design/IconButton";
import type { AppSettings } from "@/shared/types/app";
import { useRepoSession } from "@/features/repo-session/context";

interface WelcomeScreenProps {
  settings: AppSettings;
  onSetLaunchMode: (mode: AppSettings["launchMode"]) => void;
  onOpenSettings: () => void;
}

function folderName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function folderInitial(path: string): string {
  const name = folderName(path).trim();
  return (name[0] ?? "?").toUpperCase();
}

export function WelcomeScreen({
  settings,
  onSetLaunchMode,
  onOpenSettings,
}: WelcomeScreenProps) {
  const { openRepo } = useRepoSession();
  const hasRecents = settings.recentRepos.length > 0;

  async function pickFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open a repository",
    });
    if (typeof selected === "string") {
      void openRepo(selected);
    }
  }

  return (
    <div className="app-body">
      <div className="workspace-sheet welcome-sheet">
        <div className="welcome-settings">
          <IconButton name="settings" onClick={onOpenSettings} />
        </div>
        <main id="main-content" className="welcome">
          <h1>Open a repository</h1>
          <p className="welcome-lead">
            The branch against the base. Commits and the working tree.
          </p>
          <button
            type="button"
            className="compare-trigger welcome-open"
            onClick={() => void pickFolder()}
          >
            {hasRecents ? "Open another folder…" : "Open repository…"}
          </button>
          {hasRecents && (
            <ul className="welcome-recents">
              {settings.recentRepos.map((path) => (
                <li key={path}>
                  <button type="button" onClick={() => void openRepo(path)}>
                    <span className="workspaces-well" aria-hidden="true">
                      {folderInitial(path)}
                    </span>
                    <span>
                      <span className="recent-name">{folderName(path)}</span>
                      <span className="recent-path">{path}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!settings.launchPreferenceSet && (
            <p className="welcome-launch">
              At launch:{" "}
              <button
                type="button"
                className="welcome-launch-action"
                aria-pressed={settings.launchMode === "reopen"}
                onClick={() => onSetLaunchMode("reopen")}
              >
                reopen last
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                className="welcome-launch-action"
                aria-pressed={settings.launchMode === "empty"}
                onClick={() => onSetLaunchMode("empty")}
              >
                ask me
              </button>
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
