import { openUrl } from "@tauri-apps/plugin-opener";

type OpenUrl = (url: string) => Promise<void>;

/** Open a project page in the system browser. https only. */
export async function openProject(
  url: string,
  open: OpenUrl = openUrl,
): Promise<void> {
  let href: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return;
    href = parsed.href;
  } catch {
    return;
  }

  try {
    await open(href);
  } catch {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}
