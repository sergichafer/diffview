import { useState } from "react";

const CONFETTI_PIECES = 10;

interface ViewedToggleProps {
  path: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ViewedToggle({
  path,
  checked,
  onChange,
}: ViewedToggleProps) {
  const [burstKey, setBurstKey] = useState(0);
  const fileName = path.split("/").pop() ?? path;
  const label = checked
    ? `Mark ${fileName} as not viewed`
    : `Mark ${fileName} as viewed`;

  const handleClick = () => {
    const next = !checked;
    onChange(next);
    if (next) setBurstKey((k) => k + 1);
  };

  return (
    <button
      type="button"
      className={`icon-btn icon-btn-sm viewed-control${checked ? " is-checked" : ""}`}
      data-viewed-toggle
      data-viewed-path={path}
      aria-label={label}
      title={label}
      aria-pressed={checked}
      onClick={handleClick}
    >
      <span className="icon-btn-surface viewed-control-surface">
        <span className="viewed-label">Viewed</span>
        <span className="viewed-box" aria-hidden="true">
          {checked && (
            <svg className="viewed-mark" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
          )}
          {burstKey > 0 && (
            <span className="viewed-confetti" key={burstKey}>
              {Array.from({ length: CONFETTI_PIECES }, (_, i) => (
                <span
                  key={i}
                  className="viewed-confetti-piece"
                  style={{ "--i": i } as React.CSSProperties}
                />
              ))}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
