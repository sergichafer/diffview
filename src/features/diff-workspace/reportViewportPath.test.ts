import { describe, expect, test } from "bun:test";
import {
  armRestore,
  cancelRestore,
  initialRestoreState,
} from "./restoreActivePath";

/**
 * Mirrors Diff Workspace `reportViewportPath`: user scroll cancels pending
 * restore before updating the active path.
 */
function reportViewportPath(
  restore: ReturnType<typeof initialRestoreState>,
  selectedPath: string | null,
  path: string,
): { restore: ReturnType<typeof initialRestoreState>; selectedPath: string | null } {
  const nextRestore = cancelRestore(restore);
  if (path === selectedPath) {
    return { restore: nextRestore, selectedPath };
  }
  return { restore: nextRestore, selectedPath: path };
}

describe("reportViewportPath / restore cancel", () => {
  test("manual scroll cancels pending restore so later item churn cannot yank back", () => {
    const armed = armRestore(initialRestoreState(), "a\0b\0c", "a.ts");
    expect(armed.pending).toBe("a.ts");

    const afterScroll = reportViewportPath(armed, "a.ts", "b.ts");
    expect(afterScroll.restore.pending).toBeNull();
    expect(afterScroll.selectedPath).toBe("b.ts");
  });

  test("same path is a no-op for selection but still clears pending restore", () => {
    const armed = armRestore(initialRestoreState(), "key", "a.ts");
    const after = reportViewportPath(armed, "a.ts", "a.ts");
    expect(after.restore.pending).toBeNull();
    expect(after.selectedPath).toBe("a.ts");
  });
});
