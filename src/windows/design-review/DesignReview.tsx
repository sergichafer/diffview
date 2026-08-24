import { useState } from "react";
import { IconButton, IconGlyph } from "@/design/IconButton";
import { useAppFonts } from "@/design/fonts/useAppFonts";
import { DEFAULT_THEME_ID } from "@/design/theme/registry";
import { useAppTheme, useResolvedTheme } from "@/design/theme/useResolvedTheme";
import { ExportControl, type ExportShape } from "./ExportControl";
import { restingLabel, type RestingCopy } from "./restingLabel";
import "@/windows/main/App.css";
import "./design-review.css";

const SAMPLE_PROMPT = `Address these review notes in the working tree. Each block is a file path, a line range, the current text of those lines, and the comment to apply.

### src/features/diff-workspace/BranchDiffPanel.tsx 136-148

\`\`\`tsx
  const diffOptions = useMemo((): CodeViewReactOptions => {
    return {
      theme: getPierreThemePair(themeId),
      themeType: themeMode,
      diffStyle,
      stickyHeaders: true,
      layout: { paddingTop: 0, paddingBottom: 0, gap: 0 },
    };
  }, [themeMode, themeId, diffStyle, unsafeCSS, loadDiffFiles]);
\`\`\`

\`loadDiffFiles\` is in the dependency list but missing from the object. Include it in the returned options.

### src/features/diff-edit/useDiffEdit.ts 88

\`\`\`ts
    isLive: editAllowed,
\`\`\`

Rename \`isLive\` so the call site matches the hook. Ref-to-ref comparisons must stay read-only.
`;

export function DesignReview() {
  const [themeMode, setThemeMode] = useState<"light" | "dark">("dark");
  const [shape, setShape] = useState<ExportShape>("chip");
  const [copy, setCopy] = useState<RestingCopy>("review");
  const [card, setCard] = useState<"draft" | "saved">("saved");
  const resolvedTheme = useResolvedTheme(themeMode);
  useAppTheme(resolvedTheme, DEFAULT_THEME_ID);
  useAppFonts("inter", "jetbrains-mono");

  const commentCount = 2;

  return (
    <div
      className="app review-root"
      data-theme={resolvedTheme}
      data-palette={DEFAULT_THEME_ID}
    >
      <a href="#review-scene" className="skip-link">
        Skip to mock
      </a>
      <header className="review-doc-head">
        <p className="review-kicker">Design review</p>
        <h1>Line comments and copy-for-AI</h1>
        <p className="review-lead">
          Session notes on a DiffsHub-style gutter, then a floating control that
          copies a prompt. This page uses Harmony tokens, Inter, and the same
          press and swap motion as Refresh.
        </p>
      </header>

      <section className="review-locked" aria-labelledby="review-locked-title">
        <h2 id="review-locked-title">Locked</h2>
        <ul>
          <li>Gutter + on hover or on the selected range, same as DiffsHub.</li>
          <li>
            A comment covers a line range and the note can have real newlines.
          </li>
          <li>
            The card sits under the last selected line, on that line’s side.
          </li>
          <li>Export copies markdown to the clipboard. No file.</li>
          <li>
            Prompt: short instructions, then path, range, fenced snippet, note.
          </li>
          <li>Snippet is the side the comment sits on, for that range.</li>
          <li>Export control: bottom-right of the diff pane, fixed in view.</li>
          <li>Appears once there is at least one saved comment.</li>
          <li>Copied uses the Refresh glyph swap, then returns to rest.</li>
          <li>Inline cards only. No comments list in the files column.</li>
          <li>Edit or delete a saved note. Session only.</li>
          <li>
            Cards: <code>--bg-inset</code>, 12px radius, no dialog shadow.
          </li>
          <li>
            Motion: existing 100ms press scale and 360ms{" "}
            <code>cubic-bezier(0.32, 0.72, 0, 1)</code>. No spring library.
          </li>
        </ul>
      </section>

      <div className="review-controls" role="group" aria-label="Review options">
        <fieldset>
          <legend>Theme</legend>
          <Option
            name="theme"
            value="dark"
            checked={themeMode === "dark"}
            onChange={() => setThemeMode("dark")}
            label="Dark"
          />
          <Option
            name="theme"
            value="light"
            checked={themeMode === "light"}
            onChange={() => setThemeMode("light")}
            label="Light"
          />
        </fieldset>
        <fieldset>
          <legend>Export control</legend>
          <Option
            name="shape"
            value="icon"
            checked={shape === "icon"}
            onChange={() => setShape("icon")}
            label="A. Icon button"
          />
          <Option
            name="shape"
            value="chip"
            checked={shape === "chip"}
            onChange={() => setShape("chip")}
            label="B. Labeled chip"
          />
          <Option
            name="shape"
            value="fab"
            checked={shape === "fab"}
            onChange={() => setShape("fab")}
            label="C. Round FAB"
          />
        </fieldset>
        <fieldset>
          <legend>Resting copy</legend>
          <Option
            name="copy"
            value="review"
            checked={copy === "review"}
            onChange={() => setCopy("review")}
            label="Copy review"
          />
          <Option
            name="copy"
            value="count"
            checked={copy === "count"}
            onChange={() => setCopy("count")}
            label="Copy N comments"
          />
          <Option
            name="copy"
            value="ai"
            checked={copy === "ai"}
            onChange={() => setCopy("ai")}
            label="Copy for AI"
          />
        </fieldset>
        <fieldset>
          <legend>Card in the mock</legend>
          <Option
            name="card"
            value="saved"
            checked={card === "saved"}
            onChange={() => setCard("saved")}
            label="Saved"
          />
          <Option
            name="card"
            value="draft"
            checked={card === "draft"}
            onChange={() => setCard("draft")}
            label="Draft"
          />
        </fieldset>
      </div>

      <section
        id="review-scene"
        className="review-scene"
        aria-labelledby="review-scene-title"
      >
        <div className="review-scene-meta">
          <h2 id="review-scene-title">In the app</h2>
          <p>
            Click the export control to play Copied. Selection is lines 136–148
            on the new side. Resting name: {restingLabel(copy, commentCount)}.
          </p>
        </div>
        <AppMock shape={shape} copy={copy} card={card} />
      </section>

      <section className="review-compare" aria-labelledby="review-compare-title">
        <h2 id="review-compare-title">Export controls at rest and Copied</h2>
        <p className="review-section-lead">
          Same tokens as the top-bar icon buttons. Click any of them.
        </p>
        <div className="review-export-grid">
          <figure>
            <figcaption>A. Icon button</figcaption>
            <div className="review-export-stage">
              <ExportControl
                shape="icon"
                copy={copy}
                commentCount={commentCount}
              />
            </div>
            <p>
              Same footprint as Refresh. The glyph becomes a check. The
              accessible name becomes Copied.
            </p>
          </figure>
          <figure>
            <figcaption>B. Labeled chip</figcaption>
            <div className="review-export-stage">
              <ExportControl
                shape="chip"
                copy={copy}
                commentCount={commentCount}
              />
            </div>
            <p>
              Copy review / Copied is on the control. Closest to “says Copied.”
            </p>
          </figure>
          <figure>
            <figcaption>C. Round FAB</figcaption>
            <div className="review-export-stage">
              <ExportControl
                shape="fab"
                copy={copy}
                commentCount={commentCount}
              />
            </div>
            <p>
              Icon at rest. Copied caption arrives from the left, then leaves.
            </p>
          </figure>
        </div>
      </section>

      <section className="review-prompt" aria-labelledby="review-prompt-title">
        <h2 id="review-prompt-title">Clipboard payload</h2>
        <pre className="review-prompt-sample">
          <code>{SAMPLE_PROMPT}</code>
        </pre>
      </section>

      <section className="review-open" aria-labelledby="review-open-title">
        <h2 id="review-open-title">Still open</h2>
        <ul>
          <li>Which export shape and resting label to ship.</li>
          <li>
            A range that starts on deletions and ends on additions: snippet
            follows the card’s end side, or both sides.
          </li>
          <li>Comments while a file is in Edit.</li>
          <li>Two notes on the same range.</li>
        </ul>
      </section>
    </div>
  );
}

function Option({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className={`review-option${checked ? " is-on" : ""}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
      />
      {label}
    </label>
  );
}

function AppMock({
  shape,
  copy,
  card,
}: {
  shape: ExportShape;
  copy: RestingCopy;
  card: "draft" | "saved";
}) {
  return (
    <div className="review-app-frame">
      <div className="app-body">
        <div className="workspace-sheet">
          <div className="sheet-pane">
            <header className="top-bar">
              <div className="topbar-copy">
                <h2 className="topbar-title">Working tree</h2>
                <p className="topbar-lead">diffview · against main</p>
              </div>
              <div className="topbar-zone topbar-zone-right icon-toolbar">
                <IconButton name="refresh" title="Refresh" />
                <IconButton name="settings" />
              </div>
            </header>
            <div className="workspace">
              <aside className="review-tree" aria-hidden="true">
                <div className="diff-style-bar">Files</div>
                <ul>
                  <li>useDiffEdit.ts</li>
                  <li className="is-active">BranchDiffPanel.tsx</li>
                  <li>buildItems.ts</li>
                </ul>
              </aside>
              <div className="splitter" aria-hidden="true" />
              <section className="main-column">
                <div className="diff-style-bar">
                  <IconButton name="split" size="sm" active title="Split view" />
                  <IconButton name="unified" size="sm" title="Unified view" />
                  <span className="diff-style-spacer" />
                  <span className="diff-style-count">3 files</span>
                </div>
                <div className="diff-panel branch-diff-panel review-diff">
                  <div className="review-file-head">
                    <span className="review-file-name">
                      src/features/diff-workspace/BranchDiffPanel.tsx
                    </span>
                    <div className="diff-header-actions">
                      <div className="diff-header-actions-tools">
                        <IconButton name="edit" size="sm" title="Edit" />
                        <IconButton
                          name="chevron-up"
                          size="sm"
                          title="Collapse diff"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="review-diff-body">
                    <DiffLine n={134} text="  };" />
                    <DiffLine n={135} text="" />
                    <DiffLine
                      n={136}
                      add
                      selected
                      text="  const diffOptions = useMemo((): CodeViewReactOptions => {"
                    />
                    <DiffLine
                      n={137}
                      add
                      selected
                      text="    return {"
                    />
                    <DiffLine
                      n={138}
                      add
                      selected
                      text="      theme: getPierreThemePair(themeId),"
                    />
                    <DiffLine
                      n={139}
                      add
                      selected
                      gutterPlus
                      text="      themeType: themeMode,"
                    />
                    {card === "draft" ? <DraftCard /> : <SavedCard />}
                    <DiffLine n={140} add text="      diffStyle," />
                    <DiffLine n={141} add text="      stickyHeaders: true," />
                    <DiffLine n={149} text="  }, [themeMode, themeId]);" />
                  </div>
                  <ExportControl
                    shape={shape}
                    copy={copy}
                    commentCount={2}
                  />
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffLine({
  n,
  text,
  add = false,
  selected = false,
  gutterPlus = false,
}: {
  n: number;
  text: string;
  add?: boolean;
  selected?: boolean;
  gutterPlus?: boolean;
}) {
  return (
    <div
      className={`review-line${add ? " is-add" : ""}${selected ? " is-selected" : ""}`}
    >
      <span className="review-gutter">
        {gutterPlus ? (
          <button type="button" className="review-gutter-plus" aria-label="Add comment">
            <IconGlyph name="plus" />
          </button>
        ) : (
          n
        )}
      </span>
      <span className="review-sigil" aria-hidden="true">
        {add ? "+" : " "}
      </span>
      <code>{text || " "}</code>
    </div>
  );
}

function DraftCard() {
  return (
    <form className="review-note" onSubmit={(event) => event.preventDefault()}>
      <label className="visually-hidden" htmlFor="review-draft">
        Comment
      </label>
      <textarea
        id="review-draft"
        rows={3}
        defaultValue={
          "loadDiffFiles is in the dependency list but missing from the object."
        }
      />
      <div className="review-note-actions">
        <button type="button" className="review-text-btn">
          Cancel
        </button>
        <IconButton name="arrow-right" size="sm" title="Save comment" />
      </div>
    </form>
  );
}

function SavedCard() {
  return (
    <div className="review-note">
      <p className="review-note-range">136–139 · additions</p>
      <p className="review-note-body">
        <code>loadDiffFiles</code> is in the dependency list but missing from
        the object. Include it in the returned options.
      </p>
      <div className="review-note-actions">
        <button type="button" className="review-text-btn">
          Edit
        </button>
        <IconButton name="close" size="sm" title="Delete comment" />
      </div>
    </div>
  );
}
