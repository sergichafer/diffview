# Line comments + Copy review prompt

Implementation plan for Diffview. Follow this file. When the feature is complete, **delete this file** in the same PR (it is not product docs). Do not port `design-review.html` or `src/windows/design-review/` from PR #17; that exploration stays on the closed branch.

Copy rules for UI strings, comments, and README: no em dashes, no "not X, it's Y" pivots, no filler transitions, no therapeutic language. See `AGENTS.md`.

## Locked product

| Decision | Lock |
|---|---|
| Create comments | DiffsHub-style gutter `+` on hover / selected range (`enableGutterUtility` + `onGutterUtilityClick`) |
| Floating control | Export only. Visible when **saved** comments exist. Hidden for drafts-only. |
| Resting label | **Copy review prompt** (exact words, no count) |
| Copied label | **Copied** |
| Shape | Labeled **chip**: clipboard glyph + words. Not an icon-only button, not a round FAB. |
| Export destination | Clipboard only (`navigator.clipboard.writeText`). No file save. |
| Payload | A **prompt**: short instructions, then each saved comment with matching code. |
| Multiline | Both: source **range** (selection) and note **body** (real newlines, `white-space: pre-wrap` when saved). |
| Chip position | Bottom-right of the **diff pane** (`.diff-panel`), `position: absolute` so it stays put while the CodeView scrolls. |
| Lifetime | **Session only**. Gone when the comparison closes or the app quits. No plugin store. No Tauri/git for comments. |
| Files column | No comments list. Inline cards + the export chip only. |
| After save | Edit or delete. No resolved state. |
| Locator | Repo-relative path + line/range. Snippet is **exactly those lines**, fenced, then the note. |
| Card park | `range.endSide ?? range.side`, line `range.end` (DiffsHub). |
| Snippet side | That same side only (end side). Not both sides for a cross-side drag. |
| Copied motion | Same as Refresh: 360ms `cubic-bezier(0.32, 0.72, 0, 1)` layer swap, 100ms press `scale(0.97)`. No spring library. `prefers-reduced-motion`: opacity only. Hold **Copied** ~1400ms, then return. |
| Cards | Quiet inset: `--bg-inset`, 12px radius (`--control-radius`), 1px `--border-default` with `--border-highlight` on top. No dialog shadow, no glass over syntax. |
| Chip chrome | Elevated control like icon buttons (`--control-fill`, `--border-default`, hover/press tokens). |
| Draft keys | Enter = newline. Save: ⌘/Ctrl+Enter, Shift+Enter, or the save button. Escape / Cancel discards with no confirm dialog. |
| Edit vs comments | Disable gutter create on a file that is currently in **Edit**. |
| Same-line stack | Pierre slots are `annotation-{side}-{lineNumber}` (`getLineAnnotationName`). **At most one comment per (path, side, end line).** A second `+` on an occupied slot is a no-op. |
| Draft uniqueness | One active draft in the comparison at a time (DiffsHub). Starting a new draft removes the previous draft everywhere. |
| Frontend git | Never. Comments never call `src/shared/tauri/api.ts`. |

## Prompt payload

Intro (exact):

```
Address these review notes in the working tree. Each block is a file path, a line range, the current text of those lines, and the comment to apply.
```

Then, for each **saved** comment, file order = CodeView item order (changed-files order). Within a file, annotation order.

~~~
### {path} {range}

```{lang}
{snippet}
```

{message}
~~~

- Single line: `{range}` is `142`. Span: `142-147` (hyphen, not en dash).
- Fence language: `fileDiff.lang` if set, else from the path (`tsx` / `ts` / `css` / `rust` / empty).
- Blank line after the intro, between blocks, trailing newline at end of prompt.
- Drafts are omitted.
- Capture **snippet at save** (and again when the user saves an edit). Do not rewrite snippets on refresh.

Show **Copied** only after `writeText` succeeds. On failure, stay on the resting label.

## DiffsHub / Pierre (do not clone unless needed)

Upstream: `pierrecomputer/pierre`, app `apps/diffshub`, library `packages/diffs`. A local clone may exist at `/tmp/pierre`.

### Create flow (DiffsHub)

`apps/diffshub/components/DiffsHubViewer.tsx`:

- `enableGutterUtility: true`
- `enableLineSelection: true`
- `onGutterUtilityClick(range, context)` → draft on `context.item.id`
- `renderAnnotation` for the card
- `selectedLines` / `onSelectedLinesChange` so a card click restores the range highlight via `setSelectedLines({ id, range })`
- `+` sits on the visually bottom line of the selection; click/drag-up still passes the full `SelectedLineRange`

Draft construction:

```ts
const side = range.endSide ?? range.side;
const lineNumber = range.end;
// DiffLineAnnotation: { side, lineNumber, metadata: { kind, key, message, range } }
```

One draft: strip drafts from **all** files, then append the new draft. If the previous draft was on another item, that item's `annotations` lose that row.

DiffsHub mutates via `viewer.updateItem` after bumping `item.version` because its CodeView is **uncontrolled** (`initialItems`). Diffview's CodeView is **controlled** (`items={displayItems}`). Put annotations on `displayItems` and fold a comments revision into `item.version` so `syncPierreItems` calls `updateItem`. Do not copy DiffsHub's in-place mutation as the source of truth.

### Types

```ts
// @pierre/diffs
SelectedLineRange { start, side?, end, endSide? }
DiffLineAnnotation<T> { side: 'additions' | 'deletions', lineNumber, metadata: T }
CodeViewDiffItem<T> { id, type: 'diff', fileDiff, annotations?, version?, collapsed?, edit? }
```

React `renderAnnotation` receives one `DiffLineAnnotation` (slot is per side+line). Wrap the card in `<div style={{ whiteSpace: 'normal' }}>`. Pierre's virtualizer treats annotation rows as extra height; `ResizeManager` watches `[data-line-annotation]`.

### Snippet from `FileDiffMetadata` (not git)

`FileDiffMetadata` (`packages/diffs/src/types.ts`, also in `node_modules/@pierre/diffs`):

- `additionLines` / `deletionLines`: line text arrays
- Each `Hunk`: `additionStart`, `additionCount`, `additionLineIndex`, `deletionStart`, `deletionCount`, `deletionLineIndex`

For side `additions` and 1-based lines `start..end` (inclusive, use `min`/`max` of `range.start`/`range.end`):

- Find hunk where `additionStart <= line < additionStart + additionCount`
- Index `hunk.additionLineIndex + (line - additionStart)`
- Read `fileDiff.additionLines[index]`

Same for `deletions` with the deletion fields. Skip lines that are not in any hunk (collapsed gaps / missing). Join with `\n`. Do not include the `+`/`-` prefix; these arrays are already the line text.

`isPartial: true` still uses hunk mapping (patch-only arrays). After `loadDiffFiles` hydrates, new saves see full files; old snippets stay as captured.

## Architecture in this repo

### Feature folder

`src/features/line-comments/` (no barrel `index.ts`):

| File | Role |
|---|---|
| `commentMeta.ts` | Types, `PROMPT_INTRO`, `annotationAnchor`, `rangeLabel`, `languageFromPath`, `makeAnnotation`, `savedComments`, `buildExportPrompt` |
| `extractSnippet.ts` | `extractSnippet(fileDiff, side, start, end)` |
| `commentsReducer.ts` | Map keyed by `ComparisonKey` → path → annotations |
| `LineCommentsProvider.tsx` | Same lifecycle as `DiffReviewProvider`: reset on merge-base change, evict when key leaves `openKeys` |
| `CommentCard.tsx` | Draft textarea + saved body/actions |
| `CopyReviewPrompt.tsx` | Chip only (no HUD, no shape/copy pickers) |
| `line-comments.css` | Cards + chip. Import from `src/design/app.css` `@layer blocks` |
| `*.test.ts(x)` | Beside the subject, `bun:test` + happy-dom |

Do not put comment state in `src/features/diff-review/` (that module is viewed/collapse). Consume it from `BranchWorkspace` / `BranchDiffPanel` / `useDiffWorkspace` the same way `useDiffReview` is consumed.

### State shape

```ts
type CommentKind = "draft" | "saved";

type CommentMeta = {
  kind: CommentKind;
  key: string;
  message: string;
  range: SelectedLineRange;
  snippet: string;
  language: string;
};

type PathComments = Record<string, DiffLineAnnotation<CommentMeta>[]>;
type CommentsMap = Record<ComparisonKey, PathComments>;
```

Keys: `makeComparisonKey` in `src/features/branch-compare/comparisonKey.ts` (`repoPath|base|head`). Mirror `useDiffReviewState` in `src/features/diff-review/DiffReviewProvider.tsx` (evict + merge-base reset). Comments are **not** persisted.

On save: set `kind: "saved"`, `message` trimmed, `snippet` from `extractSnippet` using the item's current `fileDiff` and the card side. On edit: `kind: "draft"` keeping message/range/snippet until the next save refreshes the snippet.

`commentsRev`: monotonic integer per active comparison (or global). Increment on every mutation so Pierre's version fold always changes.

### Version fold (required)

Today in `src/features/diff-workspace/useDiffWorkspace.ts`:

1. `applyViewedCollapse` → `version` 0 / 1 / 2
2. `applyEditSession` → `version = collapseVersion * 2 + (edit ? 1 : 0)` (0..5)

`syncPierreItems` skips `updateItem` when `collapsed` and `version` match. Annotations must ride that version.

Add a third step `applyCommentAnnotations(items, pathComments, commentsRev)`:

```
annotations = pathComments[item.id] ?? []  // omit or [] when empty; version must still bump when the last comment is removed
version = (editFoldedVersion) + commentsRev * 8   // 8 > 5
```

Pass `pathComments` + `commentsRev` into `useDiffWorkspace`. Keep `buildItems` cache free of annotations (overlay only).

Update `applyEditSession` tests in `src/features/diff-workspace/activePath.test.ts` only if the fold signature changes in a way that breaks them. Add tests for the comments fold beside the subject.

### CodeView wiring

`src/features/diff-workspace/BranchDiffPanel.tsx`:

- Parameterize `CodeView` / `CodeViewHandle` / items with `CommentMeta` (mechanical generic change through `useDiffWorkspace` + `BranchWorkspace`).
- Options (in addition to existing theme/layout/`loadDiffFiles`):
  - `enableGutterUtility: true`
  - `enableLineSelection: true`
  - `onGutterUtilityClick(range, context)`: ignore non-diff items; ignore if `editingPaths.has(item.id)`; otherwise start draft
  - `layout.paddingBottom`: `80` when `savedCommentCount > 0`, else `0` (last card + chip overlap)
- `selectedLines` + `onSelectedLinesChange`
- `renderAnnotation`: `whiteSpace: 'normal'` wrapper + `CommentCard`
- Chip as a sibling of `CodeView` inside `.diff-panel` (give the panel `position: relative` if needed)

Do not create comments from `onLineSelectionEnd`. Selection highlight only.

### CSS

New `src/features/line-comments/line-comments.css`, imported in `src/design/app.css` next to `diff-workspace.css`. CUBE: blocks layer. Tokens only (`--bg-inset`, `--control-fill`, `--border-default`, `--fg-base`, `--fg-muted`, `--accent-primary`, `--control-radius`, `--type-track-*`). Vendor `--diffs-*` stays in theme mappers.

Chip: height 40px, padding `0 12px 0 10px`, two stacked layers (rest / done) with the Refresh easing. Grid `grid-area: 1 / 1` for the swap. Glyphs: clipboard + check (inline SVG is fine; do not add unused icon-only/FAB variants).

Card: match the inset treatment described above. Textarea: no chrome, `field-sizing: content`, inherit font.

`.diff-panel > .copy-review-prompt` (or equivalent class): `position: absolute; right: 16px; bottom: 16px; z-index: 4`.

### README

One Features bullet, for example: `Line comments on the diff, exported as a review prompt on the clipboard`.

## Tests and gates

- `bun test` (PATH may need `~/.bun/bin/bun`)
- `npx tsc --noEmit`
- `npm run doctor` (zero **new** findings; existing `test/dom.ts` unused-file is known)
- Tests beside subjects. Cover: prompt shape, snippet from hunks (additions + deletions + missing lines), one-draft rule, occupied-slot no-op, evict/reset with `ComparisonKey`, version fold includes commentsRev, chip copies and shows Copied on success.
- No tombstone tests. No vitest/jest.

This is a Tauri desktop app. Prefer tests over `tauri dev` if the desktop runtime is unavailable. Do not add a Vite-only design-review window.

## Out of scope

- Comments sidebar / files-column list
- Resolved state, authors, avatars
- Persisted comments
- Export to file
- Icon-only or FAB export
- Resting-copy picker / HUD
- Comment remap when patches shift after refresh
- Rust / typeshare / `npm run generate:types` (frontend-only)

## Suggested implementation order

1. Pure functions + tests (`commentMeta`, `extractSnippet`, reducer).
2. `LineCommentsProvider` + lifecycle tests (copy the `useDiffReviewState` test harness pattern).
3. Version fold in `useDiffWorkspace` + `syncPierreItems` still updates on commentsRev.
4. `CommentCard` + CSS.
5. Wire `BranchDiffPanel` / `BranchWorkspace` / `App.tsx`.
6. `CopyReviewPrompt` chip + CSS + clipboard test.
7. README.
8. `tsc`, `bun test`, `doctor`.
9. Delete **this** plan file.
10. Commit, push, update the PR.
