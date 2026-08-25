import type { ExportShape } from "./ExportControl";
import { RESTING_COPY_OPTIONS, type RestingCopy } from "./restingLabel";

interface ReviewHudProps {
  themeMode: "light" | "dark";
  onThemeMode: (mode: "light" | "dark") => void;
  shape: ExportShape;
  onShape: (shape: ExportShape) => void;
  copy: RestingCopy;
  onCopy: (copy: RestingCopy) => void;
  card: "saved" | "draft";
  onCard: (card: "saved" | "draft") => void;
}

export function ReviewHud({
  themeMode,
  onThemeMode,
  shape,
  onShape,
  copy,
  onCopy,
  card,
  onCard,
}: ReviewHudProps) {
  return (
    <aside className="review-hud" aria-label="Review options">
      <p className="review-hud-kicker">Review options</p>
      <p className="review-hud-lead">
        Copy for AI is the current pick. Try the others on the chip at the
        bottom right of the diff.
      </p>
      <fieldset>
        <legend>Theme</legend>
        <Option
          name="theme"
          value="dark"
          checked={themeMode === "dark"}
          onChange={() => onThemeMode("dark")}
          label="Dark"
        />
        <Option
          name="theme"
          value="light"
          checked={themeMode === "light"}
          onChange={() => onThemeMode("light")}
          label="Light"
        />
      </fieldset>
      <fieldset>
        <legend>Export control</legend>
        <Option
          name="shape"
          value="icon"
          checked={shape === "icon"}
          onChange={() => onShape("icon")}
          label="A. Icon"
        />
        <Option
          name="shape"
          value="chip"
          checked={shape === "chip"}
          onChange={() => onShape("chip")}
          label="B. Chip"
        />
        <Option
          name="shape"
          value="fab"
          checked={shape === "fab"}
          onChange={() => onShape("fab")}
          label="C. FAB"
        />
      </fieldset>
      <fieldset className="review-hud-copy">
        <legend>Resting copy</legend>
        {RESTING_COPY_OPTIONS.map((option) => (
          <Option
            key={option.id}
            name="copy"
            value={option.id}
            checked={copy === option.id}
            onChange={() => onCopy(option.id)}
            label={option.hud}
          />
        ))}
      </fieldset>
      <fieldset>
        <legend>Sample note</legend>
        <Option
          name="card"
          value="saved"
          checked={card === "saved"}
          onChange={() => onCard("saved")}
          label="Saved"
        />
        <Option
          name="card"
          value="draft"
          checked={card === "draft"}
          onChange={() => onCard("draft")}
          label="Draft"
        />
      </fieldset>
    </aside>
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
