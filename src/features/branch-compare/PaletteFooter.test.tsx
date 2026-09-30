import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { PaletteFooter } = await import("./PaletteFooter");

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

function footerStat(sliced: boolean): string {
  act(() => {
    root.render(
      <PaletteFooter
        head="feature"
        base="main"
        commits={5}
        sliced={sliced}
        stat={{ files: 2, additions: 3, deletions: 1 }}
      />,
    );
  });
  return container.querySelector(".compare-footer-stat")?.textContent ?? "";
}

describe("PaletteFooter", () => {
  test("shows the branch commit count next to the comparison stat", () => {
    expect(footerStat(false)).toContain("5 commits · 2 files");
  });

  test("drops the branch commit count while a slice is active", () => {
    const text = footerStat(true);
    expect(text).not.toContain("commit");
    expect(text).toContain("2 files");
  });
});
