import type { KeyboardEvent, PointerEvent } from "react";

interface WorkspaceSplitterProps {
  width: number;
  label?: string;
  dragging?: boolean;
  settling?: boolean;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export function WorkspaceSplitter({
  width,
  label = "file tree",
  dragging = false,
  settling = false,
  onPointerDown,
  onKeyDown,
}: WorkspaceSplitterProps) {
  const className = [
    "splitter",
    dragging ? "is-dragging" : "",
    settling ? "is-splitter-settling" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      aria-label={`Resize ${label} (${width}px)`}
      aria-orientation="vertical"
      role="separator"
      aria-valuenow={Math.round(width)}
    />
  );
}
