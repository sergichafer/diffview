import { useEffect, useState } from "react";
import { restingLabel, type RestingCopy } from "./restingLabel";

export type ExportShape = "icon" | "chip" | "fab";

const COPY_HOLD_MS = 1400;

const CLIPBOARD_PATH =
  "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z";
const CHECK_PATH = "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";

function ClipboardGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d={CLIPBOARD_PATH} />
    </svg>
  );
}

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d={CHECK_PATH} />
    </svg>
  );
}

interface ExportControlProps {
  shape: ExportShape;
  copy: RestingCopy;
  commentCount: number;
  payload: string;
}

export function ExportControl({
  shape,
  copy,
  commentCount,
  payload,
}: ExportControlProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), COPY_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [copied]);

  const rest = restingLabel(copy, commentCount);
  const label = copied ? "Copied" : rest;

  return (
    <button
      type="button"
      className={`review-export review-export-${shape}${copied ? " is-copied" : ""}`}
      aria-label={label}
      title={label}
      onClick={() => {
        if (payload) {
          void navigator.clipboard.writeText(payload).catch(() => {});
        }
        setCopied(true);
      }}
    >
      {shape === "chip" ? (
        <span className="review-export-surface">
          <span className="review-export-layer review-export-rest">
            <ClipboardGlyph className="review-export-glyph" />
            <span className="review-export-words">{rest}</span>
          </span>
          <span className="review-export-layer review-export-done">
            <CheckGlyph className="review-export-glyph" />
            <span className="review-export-words">Copied</span>
          </span>
        </span>
      ) : (
        <>
          <span className="review-export-surface">
            <span className="review-export-layer review-export-rest">
              <ClipboardGlyph className="review-export-glyph" />
            </span>
            <span className="review-export-layer review-export-done">
              <CheckGlyph className="review-export-glyph" />
            </span>
          </span>
          {shape === "fab" ? (
            <span className="review-export-caption" aria-hidden={!copied}>
              Copied
            </span>
          ) : null}
        </>
      )}
      {copied ? (
        <span className="visually-hidden" role="status">
          Copied
        </span>
      ) : null}
    </button>
  );
}
