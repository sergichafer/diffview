import { IconButton } from "@/design/IconButton";
import type { RemoteOpen } from "@/features/repo-session/types";
import { redactUrl, remoteLabel } from "./remoteUrl";

interface RemoteOpensListProps {
  opens: RemoteOpen[];
  onDismiss: (url: string) => void;
}

/** Remote URLs being cloned or fetched, and the ones that failed. */
export function RemoteOpensList({ opens, onDismiss }: RemoteOpensListProps) {
  if (opens.length === 0) return null;
  return (
    <ul className="remote-opens" aria-live="polite">
      {opens.map((open) => (
        <li
          key={open.url}
          className={`remote-open${open.error ? " is-error" : ""}`}
          title={redactUrl(open.url)}
        >
          <span className="remote-open-text">
            <span className="remote-open-name">
              {remoteLabel(redactUrl(open.url))}
            </span>
            <span className="remote-open-status">
              {open.error ?? "Syncing from remote…"}
            </span>
          </span>
          <IconButton
            name="close"
            size="sm"
            title="Dismiss"
            onClick={() => onDismiss(open.url)}
          />
        </li>
      ))}
    </ul>
  );
}
