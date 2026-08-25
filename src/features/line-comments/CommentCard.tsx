import type { DiffLineAnnotation } from "@pierre/diffs";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { CommentMeta } from "./commentMeta";

interface CommentCardProps {
  annotation: DiffLineAnnotation<CommentMeta>;
  onSave: (message: string) => void;
  onDiscard: () => void;
  onEdit: () => void;
  onSelectRange: () => void;
}

export function CommentCard({
  annotation,
  onSave,
  onDiscard,
  onEdit,
  onSelectRange,
}: CommentCardProps) {
  const { kind, message: savedMessage } = annotation.metadata;
  const [message, setMessage] = useState(savedMessage);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = message.trim();

  useEffect(() => {
    setMessage(savedMessage);
  }, [annotation.metadata.key, kind, savedMessage]);

  useEffect(() => {
    if (kind !== "draft") return;
    const textarea = textareaRef.current;
    if (textarea == null) return;
    textarea.focus({ preventScroll: true });
    const cursor = textarea.value.length;
    textarea.setSelectionRange(cursor, cursor);
  }, [kind, annotation.metadata.key]);

  function save() {
    if (trimmed.length === 0) return;
    onSave(message);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onDiscard();
      return;
    }
    if (event.key !== "Enter") return;
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      save();
    }
  }

  if (kind === "draft") {
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
          <button type="button" onClick={onDiscard}>
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
    <div className="comment-card is-saved">
      <button
        type="button"
        className="comment-card-range"
        onClick={onSelectRange}
      >
        <p className="comment-card-body">{savedMessage}</p>
      </button>
      <div className="comment-card-actions">
        <button type="button" onClick={onEdit}>
          Edit
        </button>
        <button type="button" onClick={onDiscard}>
          Delete
        </button>
      </div>
    </div>
  );
}
