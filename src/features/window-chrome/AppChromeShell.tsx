import { useCustomWindowChrome } from "@/shared/tauri/tauriEnv";
import { WindowChrome } from "./WindowChrome";

/** Desktop Tauri header: drag region and wordmark; caption buttons on Windows/Linux. */
export function AppChromeShell({ title }: { title?: string }) {
  const enabled = useCustomWindowChrome();
  if (!enabled) return null;
  return (
    <div className="app-header-stack">
      <WindowChrome title={title} />
    </div>
  );
}
