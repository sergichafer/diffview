import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { DiffLineAnnotation } from "@pierre/diffs";
import type { CommentMeta } from "./commentMeta";
import { makeAnnotation } from "./commentMeta";

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CommentCard } = await import("./CommentCard");

function annotation(
  kind: CommentMeta["kind"],
  message: string,
): DiffLineAnnotation<CommentMeta> {
  const made = makeAnnotation({
    kind,
    key: "c-1",
    message,
    range: { start: 4, end: 6, side: "additions" },
    snippet: "code",
    language: "ts",
  });
  if (made == null) throw new Error("expected annotation");
  return made;
}

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

describe("CommentCard", () => {
  test("saves with meta/ctrl/shift enter and not with enter alone", () => {
    const onSave = mock((_message: string) => {});
    act(() => {
      root.render(
        <CommentCard
          annotation={annotation("draft", "hello")}
          onSave={onSave}
          onCancel={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />,
      );
    });
    const textarea = container.querySelector("textarea");
    if (textarea == null) throw new Error("missing textarea");
    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onSave).not.toHaveBeenCalled();

    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: true,
          bubbles: true,
        }),
      );
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("hello");

    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  test("escape cancels a composer without a confirm", () => {
    const onCancel = mock(() => {});
    act(() => {
      root.render(
        <CommentCard
          annotation={annotation("edit", "temp")}
          onSave={() => {}}
          onCancel={onCancel}
          onEdit={() => {}}
          onDelete={() => {}}
        />,
      );
    });
    const textarea = container.querySelector("textarea");
    act(() => {
      textarea?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("saved body keeps newlines and edit/delete fire", () => {
    const onEdit = mock(() => {});
    const onDelete = mock(() => {});
    act(() => {
      root.render(
        <CommentCard
          annotation={annotation("saved", "line one\nline two")}
          onSave={() => {}}
          onCancel={() => {}}
          onEdit={onEdit}
          onDelete={onDelete}
        />,
      );
    });
    const body = container.querySelector(".comment-card-body");
    expect(body?.textContent).toBe("line one\nline two");
    const buttons = [...container.querySelectorAll("button")];
    act(() => {
      buttons.find((btn) => btn.textContent === "Edit")?.click();
    });
    expect(onEdit).toHaveBeenCalledTimes(1);
    act(() => {
      buttons.find((btn) => btn.textContent === "Delete")?.click();
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
