import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function copyThirdPartyNotices(): Plugin {
  const src = resolve(__dirname, "THIRD_PARTY_NOTICES.md");
  return {
    name: "copy-third-party-notices",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_NOTICES.md",
        source: readFileSync(src),
      });
    },
  };
}

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), copyThirdPartyNotices()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  clearScreen: false,
  // Expose Tauri's compile-time env (TAURI_ENV_PLATFORM, etc.) via import.meta.env.
  // tauriEnv.ts uses it for the darwin/windows/linux chrome switch.
  envPrefix: ["VITE_", "TAURI_ENV_"],
  worker: {
    format: "es",
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        preview: resolve(__dirname, "preview.html"),
      },
      // Keep Pierre's edit/diff runtime in its own chunk so the main bundle
      // stays lean and edit-mode code can load with the panel.
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@pierre/diffs")) {
            return "pierre-diffs";
          }
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
