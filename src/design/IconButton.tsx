import type { ButtonHTMLAttributes, Ref } from "react";
import { DIFFVIEW_DESIGN } from "./choice";
import { ICON_LABELS, ICON_PATHS, type IconName, type IconSize } from "./icons";

const TOGGLE_ICONS = new Set<IconName>(["split", "unified"]);

type IconButtonAria = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-expanded" | "aria-haspopup" | "aria-controls"
>;

interface IconButtonProps extends IconButtonAria {
  name: IconName;
  size?: IconSize;
  active?: boolean;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
  tabIndex?: number;
  ref?: Ref<HTMLButtonElement>;
  onClick?: () => void;
}

export function IconButton({
  name,
  size = DIFFVIEW_DESIGN.iconSize,
  active = false,
  busy,
  disabled = false,
  title,
  tabIndex,
  ref,
  onClick,
  "aria-expanded": ariaExpanded,
  "aria-haspopup": ariaHasPopup,
  "aria-controls": ariaControls,
}: IconButtonProps) {
  const label = title ?? ICON_LABELS[name];
  const showSpinner = busy !== undefined;

  return (
    <button
      ref={ref}
      type="button"
      className={`icon-btn icon-btn-${size}${active ? " is-active" : ""}${busy ? " is-busy" : ""}`}
      disabled={disabled}
      tabIndex={tabIndex}
      onClick={busy ? undefined : onClick}
      aria-label={label}
      title={label}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      aria-controls={ariaControls}
      {...(busy ? { "aria-busy": true } : {})}
      {...(TOGGLE_ICONS.has(name) ? { "aria-pressed": active } : {})}
    >
      <span className="icon-btn-surface">
        <svg className="icon-btn-glyph" viewBox="0 0 24 24" aria-hidden="true">
          <path d={ICON_PATHS[name]} />
        </svg>
        {showSpinner && (
          <span className="icon-btn-spinner" aria-hidden="true">
            <span className="icon-btn-spinner-ring" />
          </span>
        )}
      </span>
      {busy ? (
        <span className="visually-hidden" role="status">
          {label}
        </span>
      ) : null}
    </button>
  );
}

export function IconGlyph({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
