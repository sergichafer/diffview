import { useEffect, useRef, useState } from "react";

interface CopyReviewPromptProps {
  prompt: string;
}

function ClipboardGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

export const HOLD_COPIED_MS = 1400;

export function CopyReviewPrompt({ prompt }: CopyReviewPromptProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  async function copy() {
    const writeText = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    if (writeText == null) return;
    try {
      await writeText(prompt);
    } catch {
      return;
    }
    setCopied(true);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, HOLD_COPIED_MS);
  }

  const label = copied ? "Copied" : "Copy review prompt";

  return (
    <button
      type="button"
      className={`copy-review-prompt${copied ? " is-copied" : ""}`}
      onClick={() => void copy()}
      aria-label={label}
      title={label}
    >
      <span className="copy-review-prompt-surface">
        <span className="copy-review-prompt-layer is-rest" aria-hidden="true">
          <ClipboardGlyph />
          Copy review prompt
        </span>
        <span className="copy-review-prompt-layer is-done" aria-hidden="true">
          <CheckGlyph />
          Copied
        </span>
      </span>
    </button>
  );
}
