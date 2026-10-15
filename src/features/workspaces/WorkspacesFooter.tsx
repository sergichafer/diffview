import { useState } from "react";
import { IconGlyph } from "@/design/IconButton";
import { useRepoSession } from "@/features/repo-session/context";
import { RemoteOpenForm } from "@/features/remote/RemoteOpenForm";
import { RemoteOpensList } from "@/features/remote/RemoteOpensList";

interface WorkspacesFooterProps {
  inert: boolean;
  onAddWorkspace: () => void;
}

export function WorkspacesFooter({
  inert,
  onAddWorkspace,
}: WorkspacesFooterProps) {
  const { openRemote, remoteOpens, dismissRemoteOpen } = useRepoSession();
  const [remoteFormOpen, setRemoteFormOpen] = useState(false);

  return (
    <div className="workspaces-foot" inert={inert}>
      <RemoteOpensList opens={remoteOpens} onDismiss={dismissRemoteOpen} />
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
      <button
        type="button"
        className="workspaces-add-row"
        data-press=""
        onClick={() => setRemoteFormOpen((open) => !open)}
        aria-label="Add remote workspace"
        aria-expanded={remoteFormOpen}
      >
        <span className="workspaces-well" aria-hidden="true">
          <IconGlyph name="open" />
        </span>
        Add remote…
      </button>
      {remoteFormOpen ? (
        <div className="workspaces-remote">
          <RemoteOpenForm
            autoFocus
            onOpen={(url) => void openRemote(url)}
            onDone={() => setRemoteFormOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
