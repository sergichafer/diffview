import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { CODE_FONT_OPTIONS, UI_FONT_OPTIONS } from "@/design/fonts/options";
import { THEME_OPTIONS } from "@/design/theme/registry";
import { codeFontStack, uiFontStack } from "@/design/fonts/stacks";
import type { CodeFontId, UiFontId } from "@/design/fonts/types";
import { IconButton } from "@/design/IconButton";
import {
  applyOverlayOrigin,
  useOverlayPresence,
} from "@/design/useOverlayPresence";
import type { AppSettings, DiffStyle, ThemeId, ThemeMode } from "@/shared/types/app";

interface SettingsPanelProps {
  settings: AppSettings;
  onClose: () => void;
  onChange: (patch: Partial<AppSettings>) => void;
}

type SettingsPaneId = "look" | "type" | "review" | "startup";

const PANES: readonly {
  id: SettingsPaneId;
  label: string;
  icon: string;
}[] = [
  {
    id: "look",
    label: "Look",
    icon: "M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z",
  },
  {
    id: "type",
    label: "Type",
    icon: "M5 4v3h5.5v12h3V7H19V4H5z",
  },
  {
    id: "review",
    label: "Review",
    icon: "M3 15h8v-2H3v2zm0 4h8v-2H3v2zm0-8h8V9H3v2zm0-6v2h8V5H3zm10 0h8v14h-8V5z",
  },
  {
    id: "startup",
    label: "Startup",
    icon: "M8 5v14l11-7z",
  },
];

const APPEARANCE_TILES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
] as const;

const DIFF_CARDS = [
  {
    value: "split",
    label: "Split",
    description: "Old and new, side by side.",
  },
  {
    value: "unified",
    label: "Unified",
    description: "One column.",
  },
] as const;

const LAUNCH_CARDS = [
  {
    value: "reopen",
    label: "Reopen last",
    description: "Open the last repository.",
  },
  {
    value: "empty",
    label: "Welcome",
    description: "Show the welcome screen.",
  },
] as const;

const UI_SPECIMEN = "The quick brown fox";
const CODE_SPECIMEN = "const x = project(v);";

function clearModalFocus(dialog: HTMLDialogElement, modal: HTMLElement) {
  const active = document.activeElement;
  if (active instanceof HTMLElement && modal.contains(active)) {
    active.blur();
  }
  dialog.focus({ preventScroll: true });
}

function paneLabel(id: SettingsPaneId): string {
  return PANES.find((pane) => pane.id === id)?.label ?? "Look";
}

export function SettingsPanel({ settings, onClose, onChange }: SettingsPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstTriggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(true);
  const [pane, setPane] = useState<SettingsPaneId>("look");
  const { mounted, overlayState, onTransitionEnd } = useOverlayPresence(
    open,
    onClose,
  );
  const closing = overlayState === "closing";

  const requestClose = useCallback(() => {
    if (closing) return;
    setOpen(false);
  }, [closing]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const modal = modalRef.current;
    if (!dialog || !modal) return;

    const previous = document.activeElement as HTMLElement | null;
    const restoreKeyboardFocus = previous?.matches(":focus-visible") ?? false;

    dialog.showModal();
    const trigger = document.querySelector<HTMLElement>(
      'button[aria-label="Settings"]',
    );
    applyOverlayOrigin(dialog, trigger, modal);

    const settleFocus = () => {
      if (restoreKeyboardFocus) {
        firstTriggerRef.current?.focus();
        return;
      }
      clearModalFocus(dialog, modal);
    };

    queueMicrotask(settleFocus);
    const focus = requestAnimationFrame(settleFocus);

    return () => {
      cancelAnimationFrame(focus);
      if (dialog.open) dialog.close();

      if (!previous) return;
      if (restoreKeyboardFocus) {
        previous.focus();
      } else {
        previous.blur();
      }
    };
  }, []);

  if (!mounted) return null;

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      className="settings-dialog overlay-host"
      aria-labelledby="settings-title settings-pane-title"
      aria-modal="true"
      data-overlay-state={overlayState}
      onTransitionEnd={onTransitionEnd}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
    >
      <button
        type="button"
        className="settings-dialog-backdrop overlay-backdrop"
        aria-label="Close settings"
        onClick={requestClose}
      />
      <div ref={modalRef} className="settings-modal overlay-surface">
        <span id="settings-title" className="visually-hidden">
          Settings
        </span>
        <nav className="settings-nav" aria-label="Settings sections">
          <div className="settings-nav-title" aria-hidden="true">
            Settings
          </div>
          {PANES.map((item) => {
            const current = pane === item.id;
            return (
              <button
                key={item.id}
                ref={item.id === "look" ? firstTriggerRef : undefined}
                type="button"
                className="settings-nav-item"
                aria-current={current ? "page" : undefined}
                onClick={() => setPane(item.id)}
              >
                <span className="settings-nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d={item.icon} />
                  </svg>
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="settings-pane">
          <header className="settings-pane-header">
            <h2 id="settings-pane-title">{paneLabel(pane)}</h2>
            <IconButton
              name="close"
              size="sm"
              onClick={requestClose}
              title="Close settings"
            />
          </header>
          <div key={pane} className="settings-pane-body">
            {pane === "look" ? (
              <LookPane settings={settings} onChange={onChange} />
            ) : null}
            {pane === "type" ? (
              <TypePane settings={settings} onChange={onChange} />
            ) : null}
            {pane === "review" ? (
              <ReviewPane settings={settings} onChange={onChange} />
            ) : null}
            {pane === "startup" ? (
              <StartupPane settings={settings} onChange={onChange} />
            ) : null}
          </div>
        </div>
      </div>
    </dialog>
  );
}

function LookPane({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <>
      <p className="settings-lead">
        Light, dark, or the system. Choose a tile.
      </p>
      <div className="settings-block">
        <h3 id="settings-appearance-heading" className="settings-block-title">
          Appearance
        </h3>
        <div
          className="settings-tiles"
          role="group"
          aria-labelledby="settings-appearance-heading"
        >
          {APPEARANCE_TILES.map((tile) => {
            const pressed = settings.themeMode === tile.value;
            return (
              <button
                key={tile.value}
                type="button"
                className="settings-tile"
                aria-pressed={pressed}
                onClick={() =>
                  onChange({ themeMode: tile.value as ThemeMode })
                }
              >
                <AppearancePreview mode={tile.value} />
                <span className="settings-tile-label">{tile.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="settings-block">
        <h3 id="settings-theme-heading" className="settings-block-title">
          Theme
        </h3>
        <ThemeSegment
          labelledBy="settings-theme-heading"
          value={settings.themeId}
          onChange={(themeId) => onChange({ themeId })}
        />
      </div>
    </>
  );
}

function TypePane({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <>
      <p className="settings-lead">
        Read the sample. UI font for chrome. Code font for the diff.
      </p>
      <div className="settings-block">
        <h3 id="settings-ui-font-heading" className="settings-block-title">
          UI
        </h3>
        <div
          className="settings-specimens"
          role="group"
          aria-labelledby="settings-ui-font-heading"
        >
          {UI_FONT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="settings-specimen"
              aria-pressed={settings.uiFont === option.value}
              style={{ fontFamily: uiFontStack(option.value) }}
              onClick={() => onChange({ uiFont: option.value as UiFontId })}
            >
              <span className="settings-specimen-name">{option.label}</span>
              <span className="settings-specimen-sample">{UI_SPECIMEN}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="settings-block">
        <h3 id="settings-code-font-heading" className="settings-block-title">
          Code
        </h3>
        <div
          className="settings-specimens"
          role="group"
          aria-labelledby="settings-code-font-heading"
        >
          {CODE_FONT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="settings-specimen"
              aria-pressed={settings.codeFont === option.value}
              style={{ fontFamily: codeFontStack(option.value) }}
              onClick={() =>
                onChange({ codeFont: option.value as CodeFontId })
              }
            >
              <span className="settings-specimen-name">{option.label}</span>
              <span className="settings-specimen-sample">{CODE_SPECIMEN}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function ReviewPane({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <>
      <p className="settings-lead">
        Default for a new comparison. The style bar still switches a file.
      </p>
      <div className="settings-choice-grid">
        {DIFF_CARDS.map((card) => (
          <button
            key={card.value}
            type="button"
            className="settings-choice"
            aria-pressed={settings.diffStyle === card.value}
            onClick={() => onChange({ diffStyle: card.value as DiffStyle })}
          >
            <span className="settings-choice-title">{card.label}</span>
            <span className="settings-choice-desc">{card.description}</span>
            <DiffPreview style={card.value} />
          </button>
        ))}
      </div>
    </>
  );
}

function StartupPane({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  return (
    <>
      <p className="settings-lead">
        First paint: last repository, or the welcome screen.
      </p>
      <div className="settings-choice-grid">
        {LAUNCH_CARDS.map((card) => (
          <button
            key={card.value}
            type="button"
            className="settings-choice"
            aria-pressed={settings.launchMode === card.value}
            onClick={() =>
              onChange({
                launchMode: card.value as AppSettings["launchMode"],
                launchPreferenceSet: true,
              })
            }
          >
            <span className="settings-choice-title">{card.label}</span>
            <span className="settings-choice-desc">{card.description}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function ThemeSegment({
  labelledBy,
  value,
  onChange,
}: {
  labelledBy: string;
  value: ThemeId;
  onChange: (themeId: ThemeId) => void;
}) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = Math.max(
      0,
      THEME_OPTIONS.findIndex((option) => option.value === value),
    );
    let next = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = (i + 1) % THEME_OPTIONS.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = (i - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = THEME_OPTIONS.length - 1;
    }
    const option = THEME_OPTIONS[next];
    if (!option) return;
    onChange(option.value);
    const radios = e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
    radios[next]?.focus();
  };

  return (
    <div
      className="settings-seg"
      role="radiogroup"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
    >
      {THEME_OPTIONS.map((option) => {
        const checked = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            className="settings-seg-option"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function AppearancePreview({ mode }: { mode: (typeof APPEARANCE_TILES)[number]["value"] }) {
  return (
    <span className={`settings-mini is-${mode}`} aria-hidden="true">
      <span className="settings-mini-bar" />
      <span className="settings-mini-body">
        <span className="settings-mini-side" />
        <span className="settings-mini-main" />
      </span>
    </span>
  );
}

function DiffPreview({ style }: { style: DiffStyle }) {
  return (
    <span className={`settings-diff-preview is-${style}`} aria-hidden="true">
      <span className="settings-diff-preview-del">−</span>
      <span className="settings-diff-preview-add">+</span>
    </span>
  );
}
