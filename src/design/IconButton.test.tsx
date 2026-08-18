import { Window } from "happy-dom";

const dom = new Window();
for (const key of [
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "CustomEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "getComputedStyle",
  "DocumentFragment",
  "MutationObserver",
  "ResizeObserver",
] as const) {
  // @ts-expect-error assign dom globals
  if (globalThis[key] === undefined) globalThis[key] = dom[key];
}
(globalThis as any).window = dom;
(globalThis as any).document = dom.document;
(globalThis as any).navigator = dom.navigator;
(globalThis as any).customElements = dom.customElements;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof (globalThis as any).CSS === "undefined") {
  (globalThis as any).CSS = { escape: (s: string) => s };
}

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { IconButton } = await import("./IconButton");

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

describe("IconButton labels", () => {
  test("uses the icon name for aria-label and title", () => {
    act(() => {
      root.render(<IconButton name="settings" />);
    });
    const btn = container.querySelector("button.icon-btn");
    expect(btn?.getAttribute("aria-label")).toBe("Settings");
    expect(btn?.getAttribute("title")).toBe("Settings");
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  test("title prop overrides the default label", () => {
    act(() => {
      root.render(<IconButton name="close" title="Close settings" />);
    });
    const btn = container.querySelector("button.icon-btn");
    expect(btn?.getAttribute("aria-label")).toBe("Close settings");
    expect(btn?.getAttribute("title")).toBe("Close settings");
  });
});

describe("IconButton busy", () => {
  test("keeps the spinner mounted so the glyph can swap back", () => {
    act(() => {
      root.render(<IconButton name="refresh" busy={false} />);
    });
    const btn = container.querySelector("button.icon-btn");
    expect(btn?.classList.contains("is-busy")).toBe(false);
    expect(btn?.querySelector(".icon-btn-spinner")).toBeTruthy();
    expect(btn?.getAttribute("aria-busy")).toBeNull();
    expect(btn?.querySelector('[role="status"]')).toBeNull();
  });

  test("busy swaps aria to a live status without a sibling loader", () => {
    act(() => {
      root.render(
        <IconButton name="refresh" busy title="Refreshing…" />,
      );
    });
    const btn = container.querySelector("button.icon-btn");
    expect(btn?.classList.contains("is-busy")).toBe(true);
    expect(btn?.getAttribute("aria-busy")).toBe("true");
    expect(btn?.getAttribute("aria-label")).toBe("Refreshing…");
    expect(btn?.querySelector('[role="status"]')?.textContent).toBe(
      "Refreshing…",
    );
  });

  test("omits the spinner when busy is not used", () => {
    act(() => {
      root.render(<IconButton name="settings" />);
    });
    const btn = container.querySelector("button.icon-btn");
    expect(btn?.querySelector(".icon-btn-spinner")).toBeNull();
  });
});
