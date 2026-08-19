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

## Install

Enthusiast builds are published on [GitHub Releases](https://github.com/sergichafer/diffview/releases). Official store listing and Homebrew cask signing are out of scope.

Typical asset names: `Diffview_*_aarch64.dmg`, `Diffview_*_x64.dmg`, `Diffview_*_x64-setup.exe`, `Diffview_*_amd64.deb`, `Diffview-*-1.x86_64.rpm`, `Diffview_*_amd64.AppImage`.

### Arch Linux

The AUR template lives in [`packaging/aur/PKGBUILD`](packaging/aur/PKGBUILD). Copy it to the AUR as `diffview-bin` after a tagged release exists. Until then, use the AppImage or `.deb` from Releases, or build from source.

### Debian and Ubuntu

Download the `.deb` from GitHub Releases, then:

```bash
sudo apt install ./Diffview_*_amd64.deb
```

### Other Linux

Download the `.rpm` or AppImage from Releases. Mark the AppImage executable:

```bash
chmod +x Diffview_*_amd64.AppImage
```

### Windows

Download the NSIS setup (`Diffview_*_x64-setup.exe`) from Releases. SmartScreen may say Windows protected your PC; choose More info, then Run anyway. Builds are unsigned on purpose.

### macOS

Install [Rust](https://rustup.rs/) and [Node.js](https://nodejs.org/) first, then clone and build locally (ad-hoc signed):

```bash
npm ci && npm run tauri build
```

Homebrew HEAD formula (compiles on your machine). From a clone:

```bash
brew install --HEAD ./Formula/diffview.rb
```

Or tap this repository (Homebrew 6 requires trust for this custom remote):

```bash
brew tap sergichafer/diffview https://github.com/sergichafer/diffview
brew trust sergichafer/diffview
brew install --HEAD sergichafer/diffview/diffview
```

A downloaded DMG is ad-hoc signed only. Copy `Diffview.app` to `/Applications`, open it once, then if macOS blocks it choose Open Anyway in System Settings > Privacy & Security.

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

## Release

Tag `v0.1.0` (must match `tauri.conf.json`, `Cargo.toml`, and `package.json`) and push the tag, or run the Release workflow from Actions. Ubuntu 22.04 is the Linux builder so glibc stays reasonably old.

## License

[MIT](LICENSE). Copyright (c) 2026 sergichafer.
