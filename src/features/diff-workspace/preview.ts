import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const PREVIEW_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".avif",
] as const;

function hasExtension(path: string, extensions: readonly string[]): boolean {
  const lower = path.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

function isHtmlPath(path: string): boolean {
  return hasExtension(path, [".html", ".htm"]);
}

function isImagePath(path: string): boolean {
  return hasExtension(path, PREVIEW_IMAGE_EXTENSIONS);
}

export type PreviewKind = "markdown" | "image" | "html";

export function previewKind(path: string): PreviewKind {
  if (isHtmlPath(path)) return "html";
  if (isImagePath(path)) return "image";
  return "markdown";
}

export async function openPreviewWindow(repoPath: string, path: string) {
  const label = "preview";
  const title = `Preview: ${path.split("/").pop() ?? path}`;

  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.close();
  }

  // Every kind renders inside our own preview page, so the window always
  // gets the custom chrome (no native OS decorations).
  const url = `/preview.html?repoPath=${encodeURIComponent(repoPath)}&path=${encodeURIComponent(path)}`;

  new WebviewWindow(label, {
    url,
    title,
    width: 960,
    height: 720,
    center: true,
    decorations: false,
    dragDropEnabled: false,
  });
}

export function isPreviewable(path: string): boolean {
  return (
    isHtmlPath(path) ||
    hasExtension(path, [".md", ".markdown"]) ||
    isImagePath(path)
  );
}
