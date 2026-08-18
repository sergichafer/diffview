import { describe, expect, test } from "bun:test";
import { THEMES, type ThemeId } from "./registry";
import type { ColorScheme, ThemeDefinition } from "./types";

/**
 * Post-sheet role-to-surface map (solid hex only).
 *
 * One 16px sheet on `--bg-window`. Nav sits on `--bg-inset`; tree and diffs
 * stay `--bg-canvas`. Shelf also carries the title wordmark (`--fg-base`) and
 * Linux/Windows caption buttons (`--fg-muted`, hover `--fg-base`, focus
 * `--border-focus`).
 *
 * Exemptions (not asserted here):
 * - `accent.contrastOnAccent`: palette role, not mapped to a document CSS variable.
 * - `effects.ringInk`: decorative compare-trigger ring over an edge `border.default` already draws.
 * - `list.*` backgrounds, `border.default`/`strong`: non-text surfaces or alpha ramps
 *   outside this solid-hex contract.
 * - `border.seam` / `border.seamStrong`: decorative 1×/2× seam hairlines
 *   (~1.1-1.3:1 by design). Not WCAG 1.4.11 UI-component boundaries.
 * - `border.highlight`: 5% catch-light (white on dark, black on light).
 *   Asserted separately below; not a 1.4.11 boundary.
 * - `list.scrollbar`: decorative scrollbar thumb; exposed as `--scrollbar`.
 */
type BgKey = "editor" | "window" | "elevated" | "inset";

type RoleCheck = {
  /** Dot path under `roles`, e.g. `fg.base`. */
  role: string;
  /** Surfaces the role actually paints on (raw `bg.*`). */
  surfaces?: BgKey[];
  /**
   * When set, assert against the alpha-composite of this overlay role over
   * `bg.editor` (e.g. selected tree row: `list.activeSelectionBg` @ 14%).
   */
  compositeOverEditor?: string;
  /** WCAG ratio target: 7 = 1.4.6 text, 3 = 1.4.11 non-text UI. */
  target: 7 | 3;
};

const ROLE_CHECKS: RoleCheck[] = [
  // Text / fg (surfaces verified against document CSS and window-chrome.css)
  { role: "fg.base", surfaces: ["editor", "elevated", "inset", "window"], target: 7 },
  { role: "fg.muted", surfaces: ["editor", "elevated", "window", "inset"], target: 7 },
  { role: "fg.accent", surfaces: ["editor"], target: 7 },
  { role: "fg.accentBright", surfaces: ["editor", "elevated"], target: 7 },
  // Text / selected file in Pierre tree (list.activeSelectionForeground)
  {
    role: "list.activeSelectionFg",
    compositeOverEditor: "list.activeSelectionBg",
    target: 7,
  },
  // Text / state ink (diff glyphs on editor; BCP counts primarily on editor rows)
  { role: "states.success", surfaces: ["editor"], target: 7 },
  { role: "states.danger", surfaces: ["editor"], target: 7 },
  { role: "states.modified", surfaces: ["editor"], target: 7 },
  { role: "states.merge", surfaces: ["editor"], target: 7 },
  { role: "states.warn", surfaces: ["editor"], target: 7 },
  { role: "states.info", surfaces: ["editor"], target: 7 },
  // Text / syntax (Shiki tokens on the editor buffer)
  { role: "syntax.keyword", surfaces: ["editor"], target: 7 },
  { role: "syntax.func", surfaces: ["editor"], target: 7 },
  { role: "syntax.string", surfaces: ["editor"], target: 7 },
  { role: "syntax.tag", surfaces: ["editor"], target: 7 },
  { role: "syntax.entity", surfaces: ["editor"], target: 7 },
  { role: "syntax.constant", surfaces: ["editor"], target: 7 },
  { role: "syntax.operator", surfaces: ["editor"], target: 7 },
  { role: "syntax.comment", surfaces: ["editor"], target: 7 },
  { role: "syntax.markup", surfaces: ["editor"], target: 7 },
  // Non-text UI (1.4.11). Both roles paint on the control fill (`bg.elevated`)
  // and the surface around it: `accent.primary` is `--accent-primary` (rest-state)
  // glyph of every icon button); `border.focus` is the shared outline, offset
  // 2px onto whichever surface the control sits on (including Linux/Windows
  // caption buttons on `bg.window`).
  { role: "accent.primary", surfaces: ["editor", "elevated", "window"], target: 3 },
  { role: "border.focus", surfaces: ["editor", "elevated", "window"], target: 3 },
];

/** sRGB to linear light (WCAG 2 relative luminance). */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw) && !/^[0-9a-fA-F]{8}$/.test(raw)) {
    return null;
  }
  const body = raw.length === 8 ? raw.slice(0, 6) : raw;
  return [
    Number.parseInt(body.slice(0, 2), 16),
    Number.parseInt(body.slice(2, 4), 16),
    Number.parseInt(body.slice(4, 6), 16),
  ];
}

function parseRgba(value: string): { r: number; g: number; b: number; a: number } | null {
  const m = value
    .trim()
    .match(
      /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i,
    );
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] === undefined ? 1 : Number(m[4]),
  };
}

function toHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Source-over onto a solid hex. Matches how the selected tree row paints. */
function compositeOver(overlay: string, bgHex: string): string | null {
  const bg = parseHex(bgHex);
  if (!bg) return null;
  const rgba = parseRgba(overlay);
  if (rgba) {
    const { r, g, b, a } = rgba;
    return toHex([
      r * a + bg[0] * (1 - a),
      g * a + bg[1] * (1 - a),
      b * a + bg[2] * (1 - a),
    ]);
  }
  const fg = parseHex(overlay);
  if (!fg) return null;
  return toHex(fg);
}

function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(linearize) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two solid hex colours. */
export function contrastRatio(a: string, b: string): number | null {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  if (l1 === null || l2 === null) return null;
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function roleValue(roles: ThemeDefinition["roles"], path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = roles;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

const themeEntries: Array<{ id: ThemeId; scheme: ColorScheme; theme: ThemeDefinition }> = (
  Object.entries(THEMES) as Array<[ThemeId, Record<ColorScheme, ThemeDefinition>]>
).flatMap(([id, schemes]) =>
  (Object.entries(schemes) as Array<[ColorScheme, ThemeDefinition]>).map(([scheme, theme]) => ({
    id,
    scheme,
    theme,
  })),
);

describe("theme contrast (post-sheet surfaces)", () => {
  for (const { id, scheme, theme } of themeEntries) {
    describe(`${id}/${scheme}`, () => {
      for (const check of ROLE_CHECKS) {
        const surfaceLabel = check.compositeOverEditor
          ? `composite(${check.compositeOverEditor} over editor)`
          : (check.surfaces ?? []).join(", ");

        test(`${check.role} ≥ ${check.target}:1 on ${surfaceLabel}`, () => {
          const fg = roleValue(theme.roles, check.role);
          // Optional syntax / non-hex focus: skip when absent or not a solid hex.
          if (fg === undefined) {
            expect(check.role.startsWith("syntax.")).toBe(true);
            return;
          }

          if (check.compositeOverEditor) {
            const overlay = roleValue(theme.roles, check.compositeOverEditor);
            expect(overlay).toBeDefined();
            const effective = compositeOver(overlay!, theme.roles.bg.editor);
            expect(effective).not.toBeNull();
            const ratio = contrastRatio(fg, effective!);
            expect(ratio).not.toBeNull();
            expect(ratio!).toBeGreaterThanOrEqual(check.target);
            return;
          }

          for (const surface of check.surfaces ?? []) {
            const bg = theme.roles.bg[surface];
            const ratio = contrastRatio(fg, bg);
            expect(ratio).not.toBeNull();
            expect(ratio!).toBeGreaterThanOrEqual(check.target);
          }
        });
      }

    });
  }
});

describe("border.highlight catch-light", () => {
  for (const { id, scheme, theme } of themeEntries) {
    test(`${id}/${scheme} uses ${scheme === "dark" ? "white" : "black"} at 5%`, () => {
      const rgba = parseRgba(theme.roles.border.highlight);
      expect(rgba).not.toBeNull();
      expect(rgba!.a).toBeCloseTo(0.05, 4);
      const channel = scheme === "dark" ? 255 : 0;
      expect(rgba!.r).toBe(channel);
      expect(rgba!.g).toBe(channel);
      expect(rgba!.b).toBe(channel);
    });
  }
});
