import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/design/IconButton";
import { rangeLabel, type CommentMeta } from "./commentMeta";

interface CommentCardProps {
  meta: CommentMeta;
  onSave: (message: string) => void;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSelectRange: () => void;
}

export function CommentCard({
  meta,
  onSave,
  onCancel,
  onEdit,
  onDelete,
  onSelectRange,
}: CommentCardProps) {
  if (meta.kind === "draft") {
    return (
      <DraftCard
        initial={meta.message}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
  }

  return (
    <div className="review-note">
      <button
        type="button"
        className="review-note-select"
        onClick={onSelectRange}
      >
        <span className="review-note-range">{rangeLabel(meta.range)}</span>
        <span className="review-note-body">{meta.message}</span>
      </button>
      <div className="review-note-actions">
        <button type="button" className="review-text-btn" onClick={onEdit}>
          Edit
        </button>
        <IconButton
          name="close"
          size="sm"
          title="Delete comment"
          onClick={onDelete}
        />
      </div>
    </div>
  );
}

function DraftCard({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (message: string) => void;
  onCancel: () => void;
}) {
  const [message, setMessage] = useState(initial);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = message.trim();

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    const index = textarea.value.length;
    textarea.setSelectionRange(index, index);
  }, []);

  return (
    <form
      className="review-note"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed.length === 0) return;
        onSave(trimmed);
      }}
    >
      <label className="visually-hidden" htmlFor="review-draft">
        Comment
      </label>
      <textarea
        id="review-draft"
        ref={textareaRef}
        rows={3}
        value={message}
        placeholder="Add a comment…"
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
          }
          if (event.key !== "Enter") return;
          if (!event.metaKey && !event.ctrlKey && !event.shiftKey) return;
          event.preventDefault();
          if (trimmed.length === 0) return;
          onSave(trimmed);
        }}
      />
      <div className="review-note-actions">
        <button type="button" className="review-text-btn" onClick={onCancel}>
          Cancel
        </button>
        <IconButton
          name="arrow-right"
          size="sm"
          title="Save comment"
          disabled={trimmed.length === 0}
          onClick={() => {
            if (trimmed.length === 0) return;
            onSave(trimmed);
          }}
        />
      </div>
    </form>
  );
}
