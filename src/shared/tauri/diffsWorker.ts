import type {
  WorkerInitializationRenderOptions,
  WorkerPoolOptions,
} from "@pierre/diffs/worker";
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import { getPierreThemePair } from "@/design/theme";

/**
 * Initial worker theme. All theme pairs are registered via register-themes.ts;
 * runtime switches go through the worker pool's setRenderOptions. This only
 * seeds the default.
 */
const pierreThemes = getPierreThemePair();

export const diffsWorkerPoolOptions: WorkerPoolOptions = {
  poolSize: 4,
  totalASTLRUCacheSize: 256,
  workerFactory: () => new DiffsWorker(),
};

export const diffsHighlighterOptions: WorkerInitializationRenderOptions = {
  theme: pierreThemes,
  langs: [
    "typescript",
    "tsx",
    "javascript",
    "jsx",
    "rust",
    "json",
    "html",
    "css",
    "markdown",
    "python",
    "go",
    "yaml",
    "toml",
    "shell",
    "sql",
    "java",
    "c",
    "cpp",
  ],
};
