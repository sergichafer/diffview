import type { DiffLineAnnotation } from "@pierre/diffs";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { CommentMeta } from "./commentMeta";

interface CommentCardProps {
  annotation: DiffLineAnnotation<CommentMeta>;
  onSave: (message: string) => void;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function CommentCard({
  annotation,
  onSave,
  onCancel,
  onEdit,
  onDelete,
}: CommentCardProps) {
  const { kind, message: savedMessage } = annotation.metadata;
  const [message, setMessage] = useState(savedMessage);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = message.trim();
  const composing = kind !== "saved";

  useEffect(() => {
    setMessage(savedMessage);
  }, [annotation.metadata.key, kind, savedMessage]);

  useEffect(() => {
    if (!composing) return;
    const textarea = textareaRef.current;
    if (textarea == null) return;
    textarea.focus({ preventScroll: true });
    const cursor = textarea.value.length;
    textarea.setSelectionRange(cursor, cursor);
  }, [composing, annotation.metadata.key]);

  function save() {
    if (trimmed.length === 0) return;
    onSave(message);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Enter") return;
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      save();
    }
  }

  if (composing) {
    return (
      <div className="comment-card">
        <textarea
          ref={textareaRef}
          className="comment-card-composer"
          value={message}
          onChange={(event) => setMessage(event.currentTarget.value)}
          onKeyDown={onComposerKeyDown}
          placeholder="Add a comment"
          rows={2}
          aria-label="Comment"
        />
        <div className="comment-card-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={trimmed.length === 0}>
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="comment-card">
      <p className="comment-card-body">{savedMessage}</p>
      <div className="comment-card-actions">
        <button type="button" onClick={onEdit}>
          Edit
        </button>
        <button type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
