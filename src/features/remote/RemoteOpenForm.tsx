import { useId, useState, type FormEvent } from "react";
import { isRemoteUrl } from "./remoteUrl";

interface RemoteOpenFormProps {
  onOpen: (url: string) => void;
  /** Called after a submit and on Escape, so a host can close the form. */
  onDone?: () => void;
  autoFocus?: boolean;
  className?: string;
}

/** URL entry for a remote repository or a pull request. */
export function RemoteOpenForm({
  onOpen,
  onDone,
  autoFocus = false,
  className,
}: RemoteOpenFormProps) {
  const [url, setUrl] = useState("");
  const [invalid, setInvalid] = useState(false);
  const hintId = useId();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!isRemoteUrl(trimmed)) {
      setInvalid(true);
      return;
    }
    onOpen(trimmed);
    setUrl("");
    setInvalid(false);
    onDone?.();
  }

  return (
    <form
      className={`remote-form${className ? ` ${className}` : ""}`}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && onDone) {
          e.stopPropagation();
          onDone();
        }
      }}
    >
      <div className="remote-form-field">
        <input
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (invalid) setInvalid(false);
          }}
          placeholder="https://github.com/owner/repo or a pull request URL"
          aria-label="Remote repository or pull request URL"
          aria-invalid={invalid}
          aria-describedby={invalid ? hintId : undefined}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
        />
        <button type="submit" className="remote-form-submit" disabled={!url.trim()}>
          Open
        </button>
      </div>
      {invalid ? (
        <p id={hintId} className="remote-form-hint" role="alert">
          Use an https, ssh, or git@host:owner/repo URL.
        </p>
      ) : null}
    </form>
  );
}
