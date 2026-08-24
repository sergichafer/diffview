import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconGlyph } from "@/design/IconButton";
import { isTypingTarget } from "@/design/isTypingTarget";
import {
  applyOverlayOrigin,
  useOverlayPresence,
  type OverlayVisualState,
} from "@/design/useOverlayPresence";
import {
  applyBranchPick,
  type CompareSlot,
} from "./branchCompare";
import { truncateBranchLabel } from "./branchLabel";
import {
  formatCount,
  formatRelativeTime,
  type AppliedStat,
} from "./compareStat";
import type { BranchMetadata } from "@/shared/types/app";

interface BranchComparePaletteProps {
  head: string;
  base: string;
  branches: string[];
  metadata: BranchMetadata[];
  metadataLoading: boolean;
  stat: AppliedStat;
  onChange: (next: { head: string; base: string }) => void;
  onOpen: () => void;
  /** Parent-owned open (workspaces "+" and similar). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Subsequence fuzzy score; negative is no match. */
function score(query: string, name: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  if (n === q) return 1000;
  if (n.startsWith(q)) return 500;
  if (n.includes(q)) return 250;
  let qi = 0;
  for (const ch of n) if (ch === q[qi]) qi++;
  return qi === q.length ? 100 - (n.length - q.length) : -1;
}

function DivergenceChips({ meta }: { meta?: BranchMetadata }) {
  if (!meta) return null;
  return (
    <span className="compare-chips">
      <span className="compare-chip compare-chip-ahead" title={`${meta.ahead} ahead`}>
        ↑{meta.ahead}
      </span>
      <span
        className="compare-chip compare-chip-behind"
        title={`${meta.behind} behind`}
      >
        ↓{meta.behind}
      </span>
    </span>
  );
}

export function BranchComparePalette(props: BranchComparePaletteProps) {
  const { head, base, stat, onOpen, open: openProp, onOpenChange } = props;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
      if (openProp === undefined) setUncontrolledOpen(next);
    },
    [onOpenChange, openProp],
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const presence = useOverlayPresence(open);

  const handleOpen = useCallback(() => {
    onOpen();
    setOpen(true);
  }, [onOpen, setOpen]);

  // Parent-driven open still needs onOpen to load branches.
  useEffect(() => {
    if (open) onOpen();
  }, [open, onOpen]);

  useEffect(() => {
    if (open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const isSlash = e.key === "/" && !isTypingTarget(e.target);
      const isCmdK =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isSlash || isCmdK) {
        e.preventDefault();
        handleOpen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="compare-trigger"
        onClick={handleOpen}
        aria-haspopup="dialog"
        aria-expanded={presence.mounted}
        title="Change comparison. Press /."
      >
        <span className="compare-trigger-head" title={head || "Working tree"}>
          {truncateBranchLabel(head || "Working tree")}
        </span>
        <span className="compare-trigger-arrow" aria-hidden="true">
          <IconGlyph name="arrow-right" />
        </span>
        <span className="compare-trigger-base" title={base}>
          {truncateBranchLabel(base || "-")}
        </span>
        <span className="compare-trigger-stat">
          {stat.files} {stat.files === 1 ? "file" : "files"} ·{" "}
          <span className="compare-add">+{formatCount(stat.additions)}</span>{" "}
          <span className="compare-del">−{formatCount(stat.deletions)}</span>
        </span>
      </button>

      {presence.mounted && (
        <PaletteDialog
          {...props}
          overlayState={presence.overlayState}
          onTransitionEnd={presence.onTransitionEnd}
          onClose={() => setOpen(false)}
          returnFocusRef={triggerRef}
        />
      )}
    </>
  );
}

interface PaletteDialogProps extends BranchComparePaletteProps {
  overlayState: OverlayVisualState | undefined;
  onTransitionEnd: (event: { propertyName: string }) => void;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}

function PaletteDialog({
  head,
  base,
  branches,
  metadata,
  metadataLoading,
  stat,
  onChange,
  overlayState,
  onTransitionEnd,
  onClose,
  returnFocusRef,
}: PaletteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closing = overlayState === "closing";
  const [slot, setSlot] = useState<CompareSlot>("base");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const noBranches = branches.length === 0;
  const canSwap = Boolean(head && base && head !== base);

  const metaMap = useMemo(() => {
    const map = new Map<string, BranchMetadata>();
    for (const m of metadata) map.set(m.name, m);
    return map;
  }, [metadata]);

  const results = useMemo(() => {
    const scored: { name: string; s: number }[] = [];
    for (const name of branches) {
      const s = score(query, name);
      if (s >= 0) scored.push({ name, s });
    }
    scored.sort(
      (a, z) =>
        z.s - a.s ||
        (metaMap.get(z.name)?.lastCommitTime ?? 0) -
          (metaMap.get(a.name)?.lastCommitTime ?? 0) ||
        a.name.localeCompare(z.name),
    );
    return scored.map((r) => r.name);
  }, [branches, query, metaMap]);

  useEffect(() => setActive(0), [query, slot]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const palette = paletteRef.current;
    if (!dialog) return;
    const previous = returnFocusRef.current;
    dialog.showModal();
    applyOverlayOrigin(dialog, previous, palette ?? dialog);
    const focus = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(focus);
      if (dialog.open) dialog.close();
      previous?.focus();
    };
  }, [returnFocusRef]);

  const pick = (name: string) => {
    if (closing) return;
    const next = applyBranchPick(slot, name, { head, base });
    if (slot === "head") {
      onChange(next);
      setSlot("base");
      setQuery("");
      inputRef.current?.focus();
    } else {
      onChange(next);
      onClose();
    }
  };

  const swap = () => {
    if (closing || !canSwap) return;
    onChange({ head: base, base: head });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (closing || noBranches) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const name = results[active];
      if (name) pick(name);
    }
  };

  const headMeta = metaMap.get(head);
  const baseMeta = metaMap.get(base);
  const commits = headMeta?.ahead;
  const otherSlotBranch = slot === "head" ? base : head;

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      className="compare-dialog overlay-host"
      aria-label="Choose branches"
      data-overlay-state={overlayState}
      onTransitionEnd={onTransitionEnd}
      onCancel={(e) => {
        e.preventDefault();
        if (closing) return;
        onClose();
      }}
    >
      <button
        type="button"
        className="compare-backdrop overlay-backdrop"
        aria-label="Close branch selector"
        onClick={() => {
          if (!closing) onClose();
        }}
      />
      <div ref={paletteRef} className="compare-sheet overlay-surface" onKeyDown={onKeyDown}>
        <div className="compare-slots">
          <button
            type="button"
            className={`compare-slot ${slot === "head" ? "is-active" : ""}`}
            aria-pressed={slot === "head"}
            disabled={noBranches}
            onClick={() => {
              setSlot("head");
              inputRef.current?.focus();
            }}
          >
            <span className="compare-slot-tag">HEAD</span>
            <span className="compare-slot-name" title={head || "Working tree"}>
              {truncateBranchLabel(head || "Working tree", 22)}
            </span>
            <DivergenceChips meta={headMeta} />
          </button>
          <button
            type="button"
            className="compare-swap"
            onClick={swap}
            disabled={!canSwap}
            title="Swap head and base"
            aria-label="Swap head and base"
          >
            ⇄
          </button>
          <button
            type="button"
            className={`compare-slot ${slot === "base" ? "is-active" : ""}`}
            aria-pressed={slot === "base"}
            disabled={noBranches}
            onClick={() => {
              setSlot("base");
              inputRef.current?.focus();
            }}
          >
            <span className="compare-slot-tag">BASE</span>
            <span className="compare-slot-name" title={base || undefined}>
              {truncateBranchLabel(base || "-", 22)}
            </span>
            <DivergenceChips meta={baseMeta} />
          </button>
        </div>

        <div className="compare-search">
          <span className="compare-search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="compare-results"
            aria-activedescendant={
              results.length ? `compare-opt-${active}` : undefined
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              noBranches
                ? "No branches yet"
                : `Filter ${slot} branches…`
            }
            aria-label={
              noBranches ? "No branches yet" : `Set ${slot} branch`
            }
            disabled={noBranches}
            autoComplete="off"
            spellCheck={false}
          />
          {metadataLoading && (
            <span className="compare-loading" aria-live="polite">
              loading…
            </span>
          )}
        </div>

        <ul className="compare-results" id="compare-results" role="listbox">
          {noBranches ? (
            <li className="compare-empty" role="presentation">
              No commits yet. Nothing to compare.
            </li>
          ) : (
            <>
              {results.map((name, i) => {
                const meta = metaMap.get(name);
                const swaps = name === otherSlotBranch && name !== "";
                return (
                  <li key={name} role="presentation">
                    <button
                      type="button"
                      id={`compare-opt-${i}`}
                      role="option"
                      aria-selected={i === active}
                      className={`compare-row ${i === active ? "is-active" : ""}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(name)}
                    >
                      <span className="compare-avatar" aria-hidden="true">
                        {meta?.authorInitials ?? "?"}
                      </span>
                      <span className="compare-row-main">
                        <span className="compare-row-top">
                          <span className="compare-row-name">{name}</span>
                          {meta?.isDefault && (
                            <span className="compare-badge">default</span>
                          )}
                          {meta?.isCurrent && (
                            <span className="compare-badge compare-badge-current">
                              checked out
                            </span>
                          )}
                          {swaps && (
                            <span className="compare-badge compare-badge-swap">
                              swap
                            </span>
                          )}
                        </span>
                        {meta && (meta.lastSubject || meta.author) && (
                          <span className="compare-row-sub">
                            {[
                              meta.lastSubject,
                              meta.author,
                              formatRelativeTime(meta.lastCommitTime),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                      <DivergenceChips meta={meta} />
                    </button>
                  </li>
                );
              })}
              {results.length === 0 && (
                <li className="compare-empty" role="presentation">
                  No match for “{query}”
                </li>
              )}
            </>
          )}
        </ul>

        <div className="compare-footer">
          <span className="compare-footer-pair">
            {truncateBranchLabel(head || "Working tree", 20)}{" "}
            <span className="compare-footer-arrow" aria-hidden="true">
              →
            </span>{" "}
            {truncateBranchLabel(base || "-", 20)}
          </span>
          <span className="compare-footer-stat">
            {commits != null &&
              `${commits} ${commits === 1 ? "commit" : "commits"} · `}
            {stat.files} {stat.files === 1 ? "file" : "files"} ·{" "}
            <span className="compare-add">+{formatCount(stat.additions)}</span>{" "}
            <span className="compare-del">−{formatCount(stat.deletions)}</span>
          </span>
        </div>
      </div>
    </dialog>
  );
}
