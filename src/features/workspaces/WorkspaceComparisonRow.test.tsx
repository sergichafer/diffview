import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { HistorySlice } from "@/features/history/historyModel";
import type { ComparisonRow } from "@/features/repo-session/types";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { WorkspaceComparisonRow } = await import("./WorkspaceComparisonRow");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function row(history: HistorySlice): ComparisonRow {
  return {
    key: "slice-key",
    repoPath: "/repos/demo",
    baseBranch: "main",
    headBranch: "feature",
    residency: "cold",
    overview: null,
    fileDiffs: [],
    loading: false,
    error: null,
    mergeBaseOid: "",
    headOid: "",
    isLive: false,
    outdated: false,
    history,
  };
}

describe("WorkspaceComparisonRow", () => {
  test("a commit slice closes against the source branch, not the parent oid", () => {
    const history: HistorySlice = {
      sourceBase: "main",
      sourceHead: "feature",
      specBase: "parent-oid",
      specHead: "commit-oid",
      kind: "commit",
      label: "Anchor the popover",
      short: "midoid1",
      detail: "Only midoid1.",
      baseLabel: "main",
    };
    act(() => {
      root.render(
        <WorkspaceComparisonRow
          row={row(history)}
          repoName="demo"
          selected
          panelFocused
          tabIndex={0}
          onActivate={() => {}}
          onClose={() => {}}
          onFocus={() => {}}
        />,
      );
    });
    const close = container.querySelector("button.workspaces-icon");
    expect(close?.getAttribute("aria-label")).toBe(
      "Close comparison midoid1 to main",
    );
    expect(container.textContent).toContain("midoid1");
    expect(container.textContent).toContain("this commit");
    expect(container.textContent).not.toContain("parent-oid");
    expect(container.textContent).not.toContain("commit-oid");
  });
});
