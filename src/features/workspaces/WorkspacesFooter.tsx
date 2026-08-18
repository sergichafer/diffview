import { IconGlyph } from "@/design/IconButton";

interface WorkspacesFooterProps {
  inert: boolean;
  onAddWorkspace: () => void;
}

export function WorkspacesFooter({
  inert,
  onAddWorkspace,
}: WorkspacesFooterProps) {
  return (
    <div className="workspaces-foot" inert={inert}>
      <button
        type="button"
        className="workspaces-add-row"
        data-press=""
        onClick={onAddWorkspace}
        aria-label="Add workspace"
      >
        <span className="workspaces-well" aria-hidden="true">
          <IconGlyph name="plus" />
        </span>
        Add workspace…
      </button>
    </div>
  );
}
