import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { RepoSessionContext } from "@/features/repo-session/context";
import type { RepoSessionValue } from "@/features/repo-session/useRepoSession";
import type { RemoteOpen } from "@/features/repo-session/types";

const openDialog = mock(async (_opts?: unknown) => null as string | null);
const openRepo = mock(async (_path: string) => {});
const openRemote = mock(async (_url: string) => {});
const dismissRemoteOpen = mock((_url: string) => {});

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

function typeInto(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function renderWelcome(
  settings: AppSettings = DEFAULT_SETTINGS,
  handlers: {
    onSetLaunchMode?: (mode: AppSettings["launchMode"]) => void;
    onOpenSettings?: () => void;
  } = {},
  openError: string | null = null,
  remoteOpens: RemoteOpen[] = [],
) {
  const onSetLaunchMode = mock(handlers.onSetLaunchMode ?? (() => {}));
  const onOpenSettings = mock(handlers.onOpenSettings ?? (() => {}));
  act(() => {
    root.render(
      <RepoSessionContext.Provider
        value={
          {
            openRepo,
            openRemote,
            remoteOpens,
            dismissRemoteOpen,
          } as unknown as RepoSessionValue
        }
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
  openRemote.mockReset();
  openRemote.mockImplementation(async () => {});
  dismissRemoteOpen.mockReset();
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

  test("a remote URL opens through openRemote", async () => {
    renderWelcome();
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Remote repository or pull request URL"]',
    )!;
    typeInto(input, "  https://github.com/sergichafer/diffview/pull/31 ");
    await act(async () => {
      input.form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(openRemote).toHaveBeenCalledWith(
      "https://github.com/sergichafer/diffview/pull/31",
    );
    expect(input.value).toBe("");
  });

  test("a local path in the remote field shows a hint instead", async () => {
    renderWelcome();
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Remote repository or pull request URL"]',
    )!;
    typeInto(input, "/home/me/repo");
    await act(async () => {
      input.form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(openRemote).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "git@host:owner/repo",
    );
  });

  test("an scp-style URL submits through the Open button", async () => {
    renderWelcome();
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Remote repository or pull request URL"]',
    )!;
    // A native url input rejects scp syntax and blocks submit in the webview.
    typeInto(input, "git@github.com:sergichafer/diffview.git");
    await act(async () => {
      buttonNamed("Open")!.click();
    });
    expect(openRemote).toHaveBeenCalledWith("git@github.com:sergichafer/diffview.git");
  });

  test("lists syncing and failed remotes; either can be dismissed", () => {
    renderWelcome(DEFAULT_SETTINGS, {}, null, [
      { url: "https://github.com/a/b", error: null },
      { url: "https://github.com/c/d/pull/2", error: "Repository not found." },
    ]);
    expect(container.textContent).toContain("a/b");
    expect(container.textContent).toContain("Syncing from remote…");
    expect(container.textContent).toContain("c/d #2");
    expect(container.textContent).toContain("Repository not found.");

    const dismiss = container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Dismiss"]',
    );
    expect(dismiss).toHaveLength(2);
    act(() => {
      dismiss[0]!.click();
      dismiss[1]!.click();
    });
    expect(dismissRemoteOpen).toHaveBeenCalledWith("https://github.com/a/b");
    expect(dismissRemoteOpen).toHaveBeenCalledWith("https://github.com/c/d/pull/2");
  });

  test("a remote row never shows credentials from the URL", () => {
    renderWelcome(DEFAULT_SETTINGS, {}, null, [
      { url: "https://me:ghp_secret@github.com/a/b", error: null },
    ]);
    const row = container.querySelector(".remote-open")!;
    expect(row.textContent).toContain("a/b");
    expect(row.getAttribute("title")).toBe("https://github.com/a/b");
    expect(container.innerHTML).not.toContain("ghp_secret");
  });

  test("a remote recent shows owner/repo and reopens by URL", async () => {
    renderWelcome({
      ...DEFAULT_SETTINGS,
      recentRepos: ["https://github.com/sergichafer/diffview"],
    });
    expect(container.querySelector(".recent-name")?.textContent).toBe(
      "sergichafer/diffview",
    );
    await act(async () => {
      buttonContaining("https://github.com/sergichafer/diffview")!.click();
    });
    expect(openRepo).toHaveBeenCalledWith("https://github.com/sergichafer/diffview");
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
