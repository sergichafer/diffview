# Agent Instructions

Desktop diff viewer. Tauri 2 + React 19 in `src/`, Rust with libgit2 in `src-tauri/`. Product behavior lives in `README.md`.

## Commands

| Task | Command |
|------|---------|
| Dev app | `npm run tauri dev` |
| Typecheck | `npx tsc --noEmit` |
| Frontend tests | `bun test` (one file: `bun test src/features/workspaces/mru.test.ts`) |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Health check | `npm run doctor` (react-doctor; zero findings is the bar) |
| Production build | `npm run tauri build` |

## Generated files

`src/shared/types/generated/` comes from the `#[typeshare]` structs in `src-tauri/src/`. After changing one, run `npm run generate:types`. The script needs the gitignored binary `.typeshare-tools/bin/typeshare`: `cargo install typeshare-cli --version 1.13.4 --root .typeshare-tools`.

## Key conventions

- No barrel `index.ts` files. Import the module directly: `@/features/settings/useSettings`.
- Path alias `@` maps to `src/`.
- Tests sit beside their subject as `*.test.ts(x)`, run on `bun:test` with happy-dom. No vitest, no jest.
- Do not add tombstone tests whose only purpose is to assert that removed code, routes, fields, or features remain absent. Negative tests are appropriate when the failure or absence is itself a current API, security, or persistence contract.
- Comments, UI copy (labels, titles, tooltips, aria-labels), and README: no em dashes, no reversal pivots of the form "not X, it's Y", no filler transitions, no therapeutic language.
- The frontend never shells out to git. Repository access goes through `#[tauri::command]` functions in `src-tauri/src/`, invoked from `src/shared/tauri/api.ts`.
- Frontend layout: `src/windows/` holds the two entry points (main, preview), `src/features/<name>/` holds feature code, `src/design/` holds theme, fonts, and motion, `src/shared/` holds what crosses features.
- No eslint or prettier config. `tsc` strict mode and react-doctor are the static gates; keep both silent.

## CUBE CSS

- CUBE: composition / utility / block / exception
- Cascade layers: `@layer settings, generic, composition, blocks, utilities` in `src/design/app.css`
- No Harmony class. Palettes use `data-theme` (light/dark, used by CSS) and `data-palette` (catalog id, vars via `applyThemeVariables`)
- Vendor `--diffs-*` / `--trees-*` stay in mappers
- No barrel `index.ts` still applies to TS. The one CSS entry is `src/design/app.css`

## Adding a palette

1. Add `src/design/theme/themes/<id>-dark.ts` and `<id>-light.ts` exporting `ThemeRoles`.
2. Append one `THEME_CATALOG` row in `src/design/theme/registry.ts` (`id as const`, `label`, both role imports).
3. Both schemes are required. Pierre names are `diffview-<id>` and `diffview-<id>-light`.
4. Do not add CSS. Do not edit SettingsPanel. Do not edit `ThemeId` by hand.
5. Prefer `#rrggbb` for roles that vscode-colors tints with alpha (`bg.elevated`, `states.success`, `states.danger`).
6. `bun test` and `npx tsc --noEmit`.
