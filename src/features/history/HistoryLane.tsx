import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { isTypingTarget } from "@/design/isTypingTarget";
import {
  HISTORY_ROW,
  historyCaption,
  historyNodeDimmed,
  indexForSelection,
  indexToY,
  relativeCommitTime,
  yToIndex,
  type HistoryMode,
  type HistoryNode,
} from "./historyModel";

interface HistoryLaneProps {
  nodes: HistoryNode[];
  mode: HistoryMode;
  selectedHead: string | null;
  sourceBase: string;
  sourceHead: string;
  headOid: string;
  mergeBase: string;
  truncated: boolean;
  nowSeconds: number;
  onSelect: (index: number, mode: HistoryMode) => void;
  captionId?: string;
}

function clampIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index));
}

function nodeClass(node: HistoryNode): string {
  if (node.kind === "wip") return "is-wip";
  if (node.kind === "base") return "is-base";
  if (node.tip) return "is-head";
  return "";
}

function nodeSubject(node: HistoryNode): string {
  if (node.kind === "wip") return "Uncommitted changes";
  if (node.kind === "base") return node.label;
  return node.subject;
}

function nodeMeta(node: HistoryNode, nowSeconds: number): string {
  if (node.kind === "wip") return "Working tree";
  if (node.kind === "base") return "merge-base";
  const when = relativeCommitTime(node.time, nowSeconds);
  return node.tip ? `HEAD · ${when}` : when;
}

export function HistoryLane({
  nodes,
  mode: modeProp,
  selectedHead,
  sourceBase,
  sourceHead,
  headOid,
  mergeBase,
  truncated,
  nowSeconds,
  onSelect,
  captionId,
}: HistoryLaneProps) {
  const initial = indexForSelection(nodes, selectedHead);
  const [index, setIndex] = useState(initial);
  const [mode, setMode] = useState(modeProp);
  const [dragging, setDragging] = useState(false);
  const indexRef = useRef(initial);
  const modeRef = useRef(modeProp);
  const nodesRef = useRef(nodes);
  const draggingRef = useRef(false);
  const pointerId = useRef<number | null>(null);
  const downY = useRef(0);
  const suppressClick = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  nodesRef.current = nodes;
  modeRef.current = mode;
  onSelectRef.current = onSelect;

  function scrollToIndex(next: number) {
    const row = trackRef.current?.querySelector<HTMLElement>(
      `[data-history-index="${next}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }

  function commit(nextIndex: number, nextMode: HistoryMode = modeRef.current) {
    const next = clampIndex(nextIndex, nodesRef.current.length);
    indexRef.current = next;
    modeRef.current = nextMode;
    setIndex(next);
    setMode(nextMode);
    onSelectRef.current(next, nextMode);
    scrollToIndex(next);
  }

  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    setMode(modeProp);
    modeRef.current = modeProp;
  }, [modeProp]);

  useEffect(() => {
    if (draggingRef.current) return;
    const next = indexForSelection(nodes, selectedHead);
    indexRef.current = next;
    setIndex(next);
    scrollToIndex(next);
  }, [nodes, selectedHead]);

  useEffect(() => {
    const dialog = rootRef.current?.closest("dialog");
    if (!dialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      commitRef.current(indexRef.current + delta);
    };
    dialog.addEventListener("keydown", onKey);
    return () => dialog.removeEventListener("keydown", onKey);
  }, []);

  function localY(clientY: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    return clientY - (rect?.top ?? 0);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    const track = trackRef.current;
    if (track?.setPointerCapture) {
      try {
        track.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is unavailable in some test hosts.
      }
    }
    pointerId.current = event.pointerId;
    draggingRef.current = false;
    downY.current = localY(event.clientY);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerId.current !== event.pointerId) return;
    const pointer = localY(event.clientY);
    if (!draggingRef.current && Math.abs(pointer - downY.current) < 8) return;
    if (!draggingRef.current) {
      draggingRef.current = true;
      setDragging(true);
    }
    const next = clampIndex(
      Math.round(yToIndex(pointer, HISTORY_ROW)),
      nodesRef.current.length,
    );
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    const wasDragging = draggingRef.current;
    draggingRef.current = false;
    setDragging(false);
    if (wasDragging) {
      suppressClick.current = true;
      commit(indexRef.current);
      return;
    }
    if (event.target instanceof Element && event.target.closest(".history-row")) {
      return;
    }
    commit(Math.round(yToIndex(localY(event.clientY), HISTORY_ROW)));
  }

  const node = nodes[index];
  const y = indexToY(index, HISTORY_ROW);
  const baseY = indexToY(Math.max(0, nodes.length - 1), HISTORY_ROW);
  const showInk = mode === "range" && node?.kind !== "base";
  const inkTop = Math.min(y, baseY);
  const spin = node?.kind === "base" ? " rotate(45deg)" : "";
  const caption = historyCaption({
    nodes,
    index,
    mode,
    sourceBase,
    sourceHead,
    headOid,
    mergeBase,
    truncated,
  });

  return (
    <div className="history-lane" ref={rootRef}>
      <div className="history-head">
        <p className="compare-graph-head">History</p>
        <div className="history-segment" role="radiogroup" aria-label="Slice">
          <div
            className="history-segment-thumb"
            style={{ transform: `translateX(${mode === "commit" ? 100 : 0}%)` }}
          />
          <button
            type="button"
            role="radio"
            aria-checked={mode === "range"}
            onClick={() => commit(indexRef.current, "range")}
          >
            Through here
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "commit"}
            onClick={() => commit(indexRef.current, "commit")}
          >
            This commit
          </button>
        </div>
      </div>
      <div className="history-scroll">
        <div
          ref={trackRef}
          className={dragging ? "history-track is-dragging" : "history-track"}
          role="listbox"
          aria-label="Commits"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="history-track-line" />
          <div
            className="history-track-ink"
            style={{
              transform: `translateY(${inkTop}px)`,
              height: showInk ? Math.max(0, baseY - inkTop) : 0,
              opacity: showInk ? 1 : 0,
            }}
          />
          <div className="history-pill" style={{ transform: `translateY(${y}px)` }} />
          <div
            className={[
              "history-playhead",
              node?.kind === "wip" ? "is-wip" : "",
              node?.kind === "base" ? "is-base" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ transform: `translateY(${y}px)${spin}` }}
          />
          {nodes.map((entry, entryIndex) => (
            <div
              key={entry.id}
              role="option"
              aria-selected={entryIndex === index}
              data-history-index={entryIndex}
              className={[
                "history-row",
                nodeClass(entry),
                historyNodeDimmed(nodes, entryIndex, index, mode) ? "is-dim" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                commit(entryIndex);
              }}
            >
              <div className="history-dot" />
              <div>
                <div className="history-subject">{nodeSubject(entry)}</div>
                <div className="history-meta">{nodeMeta(entry, nowSeconds)}</div>
              </div>
              {entry.kind === "commit" ? (
                <div className="history-hash">{entry.short}</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <p id={captionId} className="compare-graph-caption">
        {caption}
      </p>
    </div>
  );
}
