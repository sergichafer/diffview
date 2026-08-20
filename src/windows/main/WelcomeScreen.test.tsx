import { Window } from "happy-dom";

const dom = new Window();
for (const key of [
  "document",
  "navigator",
  "HTMLElement",
  "HTMLButtonElement",
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

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { RepoSessionContext } from "@/features/repo-session/context";
import type { RepoSessionValue } from "@/features/repo-session/useRepoSession";

const openDialog = mock(async (_opts?: unknown) => null as string | null);
const openRepo = mock(async (_path: string) => {});

mock.module("@tauri-apps/plugin-dialog", () => ({
  open: (opts: unknown) => openDialog(opts),
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { WelcomeScreen } = await import("./WelcomeScreen");
const { DEFAULT_SETTINGS } = await import("@/shared/types/app");
import type { AppSettings } from "@/shared/types/app";

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

function buttonNamed(label: string) {
  return [...container.querySelectorAll("button")].find(
    (el) => el.textContent?.replace(/\s+/g, " ").trim() === label,
  ) as HTMLButtonElement | undefined;
}

function buttonContaining(text: string) {
  return [...container.querySelectorAll("button")].find((el) =>
    el.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
}

function renderWelcome(
  settings: AppSettings = DEFAULT_SETTINGS,
  handlers: {
    onSetLaunchMode?: (mode: AppSettings["launchMode"]) => void;
    onOpenSettings?: () => void;
  } = {},
  openError: string | null = null,
) {
  const onSetLaunchMode = mock(handlers.onSetLaunchMode ?? (() => {}));
  const onOpenSettings = mock(handlers.onOpenSettings ?? (() => {}));
  act(() => {
    root.render(
      <RepoSessionContext.Provider
        value={{ openRepo } as unknown as RepoSessionValue}
      >
        <WelcomeScreen
          settings={settings}
          onSetLaunchMode={onSetLaunchMode}
          onOpenSettings={onOpenSettings}
          openError={openError}
        />
      </RepoSessionContext.Provider>,
    );
  });
  return { onSetLaunchMode, onOpenSettings };
}

beforeEach(() => {
  openDialog.mockReset();
  openDialog.mockImplementation(async () => null);
  openRepo.mockReset();
  openRepo.mockImplementation(async () => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("WelcomeScreen", () => {
  test("renders the title and lead", () => {
    renderWelcome();
    expect(container.textContent).toContain("Open a repository");
    expect(container.textContent).toContain(
      "The branch against the base. Commits and the working tree.",
    );
  });

  test("with no recents, Open repository… picks a folder then openRepo", async () => {
    renderWelcome();
    expect(buttonNamed("Open repository…")).toBeTruthy();
    expect(buttonNamed("Open another folder…")).toBeUndefined();

    openDialog.mockImplementation(async () => "/repos/demo");
    await act(async () => {
      buttonNamed("Open repository…")!.click();
    });
    expect(openDialog).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "Open a repository",
    });
    expect(openRepo).toHaveBeenCalledWith("/repos/demo");
  });

  test("with recents, lists folder names and Open another folder…", async () => {
    renderWelcome({
      ...DEFAULT_SETTINGS,
      recentRepos: ["/home/me/projects/diffview", "/tmp/other"],
    });
    expect(buttonNamed("Open another folder…")).toBeTruthy();
    expect(buttonNamed("Open repository…")).toBeUndefined();
    expect(container.textContent).toContain("diffview");
    expect(container.textContent).toContain("other");
    expect(container.textContent).toContain("/home/me/projects/diffview");

    await act(async () => {
      buttonContaining("/home/me/projects/diffview")!.click();
    });
    expect(openRepo).toHaveBeenCalledWith("/home/me/projects/diffview");
  });

  test("first-run launch sentence calls onSetLaunchMode", () => {
    const { onSetLaunchMode } = renderWelcome({
      ...DEFAULT_SETTINGS,
      launchPreferenceSet: false,
    });
    expect(container.textContent).toContain("At launch:");
    expect(buttonNamed("reopen last")).toBeTruthy();
    expect(buttonNamed("ask me")).toBeTruthy();

    act(() => {
      buttonNamed("reopen last")!.click();
    });
    expect(onSetLaunchMode).toHaveBeenCalledWith("reopen");

    act(() => {
      buttonNamed("ask me")!.click();
    });
    expect(onSetLaunchMode).toHaveBeenCalledWith("empty");
  });

  test("hides the launch sentence once launchPreferenceSet", () => {
    renderWelcome({
      ...DEFAULT_SETTINGS,
      launchPreferenceSet: true,
    });
    expect(container.textContent).not.toContain("At launch:");
    expect(buttonNamed("reopen last")).toBeUndefined();
    expect(buttonNamed("ask me")).toBeUndefined();
  });

  test("settings gear calls onOpenSettings", () => {
    const { onOpenSettings } = renderWelcome();
    const gear = container.querySelector(
      'button[aria-label="Settings"]',
    ) as HTMLButtonElement | null;
    expect(gear).toBeTruthy();
    act(() => {
      gear!.click();
    });
    expect(onOpenSettings).toHaveBeenCalled();
  });

  test("shows a startup open error", () => {
    renderWelcome(DEFAULT_SETTINGS, {}, "/typo: not a git repository");
    expect(container.textContent).toContain(
      "Could not open: /typo: not a git repository",
    );
  });
});
