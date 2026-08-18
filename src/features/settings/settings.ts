import { load, type Store } from "@tauri-apps/plugin-store";
import { normalizeCodeFont, normalizeUiFont } from "@/design/fonts/normalize";
import { normalizeThemeId } from "@/design/theme/registry";
import { makeComparisonKey } from "@/features/branch-compare/comparisonKey";
import type {
  AppSettings as GeneratedAppSettings,
  WorkspaceTree,
} from "@/shared/types/generated/types";
import { DEFAULT_SETTINGS, type AppSettings } from "@/shared/types/app";

/** Keep only non-empty string keys/values (tolerates corrupt store payloads). */
export function normalizeActivePathByRepo(
  value: unknown,
): Record<string, string> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [repoPath, activePath] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (
      typeof repoPath === "string" &&
      repoPath.length > 0 &&
      typeof activePath === "string" &&
      activePath.length > 0
    ) {
      out[repoPath] = activePath;
    }
  }
  return out;
}

export function migrateActivePathByComparison(
  byComparison: unknown,
  byRepo: unknown,
  baseBranchByRepo: Record<string, string>,
  headBranchByRepo: Record<string, string>,
): Record<string, string> {
  const normalized = normalizeActivePathByRepo(byComparison);
  if (Object.keys(normalized).length > 0) return normalized;

  const legacy = normalizeActivePathByRepo(byRepo);
  const migrated: Record<string, string> = {};
  for (const [repoPath, activePath] of Object.entries(legacy)) {
    const base = baseBranchByRepo[repoPath];
    const head = headBranchByRepo[repoPath];
    if (base && head) {
      migrated[makeComparisonKey(repoPath, base, head)] = activePath;
    }
  }
  return migrated;
}

const STORE_PATH = "settings.json";

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (storePromise == null) {
    storePromise = load(STORE_PATH);
  }
  return storePromise;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function normalizeWorkspaceTree(value: unknown): WorkspaceTree {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_SETTINGS.workspaceTree };
  }
  const raw = value as Partial<WorkspaceTree>;
  const workspaces = Array.isArray(raw.workspaces)
    ? raw.workspaces
        .filter(
          (ws): ws is WorkspaceTree["workspaces"][number] =>
            ws != null &&
            typeof ws === "object" &&
            typeof (ws as { repoPath?: unknown }).repoPath === "string" &&
            (ws as { repoPath: string }).repoPath.length > 0,
        )
        .map((ws) => ({
          repoPath: ws.repoPath,
          collapsed: ws.collapsed ?? false,
          comparisons: Array.isArray(ws.comparisons)
            ? ws.comparisons
                .filter(
                  (c): c is { baseBranch: string; headBranch: string } =>
                    c != null &&
                    typeof c === "object" &&
                    typeof (c as { baseBranch?: unknown }).baseBranch ===
                      "string" &&
                    typeof (c as { headBranch?: unknown }).headBranch ===
                      "string",
                )
                .map((c) => ({
                  baseBranch: c.baseBranch,
                  headBranch: c.headBranch,
                }))
            : [],
        }))
    : [];
  return {
    workspaces,
    activeComparisonKey:
      typeof raw.activeComparisonKey === "string"
        ? raw.activeComparisonKey
        : undefined,
    columnCollapsed: raw.columnCollapsed ?? false,
  };
}

/** Merge partial store/startup payloads onto defaults and coerce known fields. */
export function normalizeAppSettings(
  partial:
    | Partial<AppSettings>
    | GeneratedAppSettings
    | null
    | undefined,
): AppSettings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...((partial as Partial<AppSettings> | null | undefined) ?? {}),
  };
  const baseBranchByRepo =
    merged.baseBranchByRepo &&
    typeof merged.baseBranchByRepo === "object" &&
    !Array.isArray(merged.baseBranchByRepo)
      ? merged.baseBranchByRepo
      : {};
  const headBranchByRepo =
    merged.headBranchByRepo &&
    typeof merged.headBranchByRepo === "object" &&
    !Array.isArray(merged.headBranchByRepo)
      ? merged.headBranchByRepo
      : {};

  return {
    ...merged,
    themeId: normalizeThemeId(merged.themeId),
    uiFont: normalizeUiFont(merged.uiFont),
    codeFont: normalizeCodeFont(merged.codeFont),
    activePathByRepo: normalizeActivePathByRepo(merged.activePathByRepo),
    activePathByComparison: migrateActivePathByComparison(
      merged.activePathByComparison,
      merged.activePathByRepo,
      baseBranchByRepo,
      headBranchByRepo,
    ),
    workspacesWidth: clamp(
      typeof merged.workspacesWidth === "number" && Number.isFinite(merged.workspacesWidth)
        ? merged.workspacesWidth
        : DEFAULT_SETTINGS.workspacesWidth,
      200,
      360,
    ),
    workspaceTree: normalizeWorkspaceTree(merged.workspaceTree),
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const store = await getStore();
  const stored = (await store.get<Partial<AppSettings>>("app")) ?? {};
  return normalizeAppSettings(stored);
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await getStore().then((store) =>
    store.set("app", settings).then(() => store.save()),
  );
}

export function pushRecent(settings: AppSettings, repoPath: string): AppSettings {
  const recent = [
    repoPath,
    ...settings.recentRepos.filter((p) => p !== repoPath),
  ].slice(0, 12);
  return { ...settings, recentRepos: recent };
}
