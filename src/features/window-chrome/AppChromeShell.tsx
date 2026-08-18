import { useCustomWindowChrome } from "@/shared/tauri/tauriEnv";
import { WindowChrome } from "./WindowChrome";

/** Desktop Tauri only; omitted when native decorations are on. */
export function AppChromeShell({ title }: { title?: string }) {
  const enabled = useCustomWindowChrome();
  if (!enabled) return null;
  return (
    <div className="app-header-stack">
      <WindowChrome title={title} />
    </div>
  );
}
