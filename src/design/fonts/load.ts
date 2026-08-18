import type { CodeFontId, UiFontId } from "./types";

const loaded = new Set<string>();

async function loadOnce(key: string, importer: () => Promise<unknown>): Promise<void> {
  if (loaded.has(key)) return;
  await importer();
  loaded.add(key);
}

/** Eager faces load from main.tsx; this covers lazy options and idempotent boot. */
export async function ensureUiFontLoaded(id: UiFontId): Promise<void> {
  switch (id) {
    case "system":
      return;
    case "inter":
      // opsz axis; family name is "Inter Variable"
      await loadOnce("inter", () => import("@fontsource-variable/inter/opsz.css"));
      return;
    case "syne":
      await loadOnce("syne", () => import("@fontsource/syne/600.css"));
      return;
    case "ibm-plex-sans":
      await loadOnce("ibm-plex-sans", async () => {
        await Promise.all([
          import("@fontsource/ibm-plex-sans/400.css"),
          import("@fontsource/ibm-plex-sans/500.css"),
          import("@fontsource/ibm-plex-sans/600.css"),
          import("@fontsource/ibm-plex-sans/700.css"),
        ]);
      });
      return;
    case "plus-jakarta-sans":
      await loadOnce("plus-jakarta-sans", async () => {
        await Promise.all([
          import("@fontsource/plus-jakarta-sans/400.css"),
          import("@fontsource/plus-jakarta-sans/500.css"),
          import("@fontsource/plus-jakarta-sans/600.css"),
          import("@fontsource/plus-jakarta-sans/700.css"),
        ]);
      });
      return;
  }
}

export async function ensureCodeFontLoaded(id: CodeFontId): Promise<void> {
  switch (id) {
    case "system":
      return;
    case "jetbrains-mono":
      await loadOnce("jetbrains-mono", async () => {
        await Promise.all([
          import("@fontsource/jetbrains-mono/400.css"),
          import("@fontsource/jetbrains-mono/500.css"),
          import("@fontsource/jetbrains-mono/600.css"),
        ]);
      });
      return;
    case "ibm-plex-mono":
      await loadOnce("ibm-plex-mono", async () => {
        await Promise.all([
          import("@fontsource/ibm-plex-mono/400.css"),
          import("@fontsource/ibm-plex-mono/500.css"),
          import("@fontsource/ibm-plex-mono/600.css"),
        ]);
      });
      return;
    case "source-code-pro":
      await loadOnce("source-code-pro", async () => {
        await Promise.all([
          import("@fontsource/source-code-pro/400.css"),
          import("@fontsource/source-code-pro/500.css"),
          import("@fontsource/source-code-pro/600.css"),
        ]);
      });
      return;
  }
}
