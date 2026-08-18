# Diffview

Desktop diff viewer. The branch against the base: commits and the working tree.

Built with **Tauri 2**, **React**, **libgit2**, [@pierre/trees](https://trees.software), and [@pierre/diffs](https://diffs.com).

## Features

- Full branch overview from merge-base → working tree
- Per-file badges: `committed`, `staged`, `unstaged`, `untracked` (respects `.gitignore`)
- File tree ([@pierre/trees](https://trees.software)) + syntax-highlighted diffs ([@pierre/diffs](https://diffs.com))
- In-pane edit on live comparisons: **Edit** in the file header, then **Save** (working tree) or **Discard**. Typing does not write until Save.
- Split / unified diff toggle
- Rendered preview window for `.html` and `.markdown` (working tree)
- Recent repos, startup preference, base branch override per repo
- Manual refresh
- CLI: `diffview /path/to/repo` or `diffview .`

## Prerequisites

- [Rust](https://rustup.rs/)
- [Node.js](https://nodejs.org/) (npm)
- [Bun](https://bun.sh/) (frontend tests)
- Linux: `webkit2gtk`, `libayatana-appindicator` (see [Tauri prerequisites](https://tauri.app/start/prerequisites/))

## Development

```bash
npm install
npm run tauri dev
```

| Task | Command |
|------|---------|
| Typecheck | `npx tsc --noEmit` |
| Frontend tests | `bun test` |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Health check | `npm run doctor` |

### Generated types

`src/shared/types/generated/types.ts` comes from the `#[typeshare]` structs in `src-tauri/src/`. After changing one, run `npm run generate:types`. The script needs the typeshare CLI at `.typeshare-tools/bin/typeshare` (gitignored):

```bash
cargo install typeshare-cli --version 1.13.4 --root .typeshare-tools
```

## Build

```bash
npm run tauri build
```

Installers appear under `src-tauri/target/release/bundle/`.

## Usage

1. Open a repository folder (or pass a path on the command line).
2. Choose a **base** branch if the default is wrong.
3. Browse files in the tree; diffs update in the main pane.
4. For HTML/Markdown outputs, click **Preview** to open a rendered window.
