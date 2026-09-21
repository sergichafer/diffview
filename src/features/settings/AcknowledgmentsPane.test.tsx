import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AcknowledgmentsPane } = await import("./AcknowledgmentsPane");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

describe("AcknowledgmentsPane", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("a project link opens through the system opener", () => {
    const onOpen = mock((_href: string) => {});
    act(() => {
      root.render(<AcknowledgmentsPane onOpen={onOpen} />);
    });

    const link = container.querySelector(
      'a[href="https://github.com/tauri-apps/tauri"]',
    ) as HTMLAnchorElement;
    expect(link.textContent).toContain("Tauri");
    expect(link.textContent).toContain("Desktop shell");
    expect(link.textContent).toContain("Opens in the browser.");

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      link.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(onOpen).toHaveBeenCalledWith("https://github.com/tauri-apps/tauri");
  });
});
