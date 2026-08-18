import type {
  AppSettings as GeneratedAppSettings,
  BranchOverview as GeneratedBranchOverview,
  ChangedFile as GeneratedChangedFile,
  DiffStyle as GeneratedDiffStyle,
  FileBadge as GeneratedFileBadge,
  FileDiffResult as GeneratedFileDiffResult,
  LaunchMode as GeneratedLaunchMode,
  ThemeMode as GeneratedThemeMode,
} from "./generated/types";
import settingsDefaults from "./generated/settingsDefaults.json";
import type { CodeFontId, UiFontId } from "@/design/fonts/types";
import type { ThemeId } from "@/design/theme/registry";

export type { ThemeId } from "@/design/theme/registry";
export type { CodeFontId, UiFontId } from "@/design/fonts/types";

export type {
  BranchMetadata,
  ComparisonFileContents,
  ComparisonStamp,
  OpenRepoResult,
  RepoInfo,
} from "./generated/types";

/** Wire badge labels: string union from the Rust/typeshare enum. */
export type FileBadge = `${GeneratedFileBadge}`;
export type LaunchMode = `${GeneratedLaunchMode}`;
export type ThemeMode = `${GeneratedThemeMode}`;
export type DiffStyle = `${GeneratedDiffStyle}`;

/** Changed file with wire badge strings (JSON enums arrive as plain strings). */
export interface ChangedFile extends Omit<GeneratedChangedFile, "badges"> {
  badges: FileBadge[];
}

export interface BranchOverview extends Omit<GeneratedBranchOverview, "files"> {
  files: ChangedFile[];
}

/** Accept both omitted and JSON-null old paths from the seam. */
export type FileDiffResult = Omit<GeneratedFileDiffResult, "oldPath"> & {
  oldPath?: string | null;
};

/**
 * App settings as used by the FE. Wire shape matches Rust `AppSettings`;
 * theme/font ids are narrowed to the design-system option sets.
 */
export type AppSettings = Omit<
  GeneratedAppSettings,
  "themeId" | "uiFont" | "codeFont" | "launchMode" | "diffStyle" | "themeMode"
> & {
  launchMode: LaunchMode;
  diffStyle: DiffStyle;
  themeMode: ThemeMode;
  themeId: ThemeId;
  uiFont: UiFontId;
  codeFont: CodeFontId;
};

export const DEFAULT_SETTINGS: AppSettings =
  settingsDefaults as unknown as AppSettings;
