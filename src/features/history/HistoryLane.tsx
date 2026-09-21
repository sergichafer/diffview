import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { isTypingTarget } from "@/design/isTypingTarget";
import {
  HISTORY_ROW,
  historyCaption,
  historyNodeDimmed,
  indexForSelection,
  relativeCommitTime,
  type HistoryMode,
  type HistoryNode,
} from "./historyModel";
import {
  containPosition,
  createSpring,
  indexToY,
  projectVelocity,
  springSettled,
  stepSpring,
  yToIndex,
  type Spring,
} from "./spring";

interface HistoryLaneProps {
  nodes: HistoryNode[];
  mode: HistoryMode;
  selectedHead: string | null;
  baseBranch: string;
  headOid: string;
  mergeBase: string;
  truncated: boolean;
  nowSeconds: number;
  onMode: (mode: HistoryMode) => void;
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
  mode,
  selectedHead,
  baseBranch,
  headOid,
  mergeBase,
  truncated,
  nowSeconds,
  onMode,
  onSelect,
  captionId,
}: HistoryLaneProps) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const initial = indexForSelection(nodes, selectedHead);
  const springRef = useRef<Spring>(createSpring(indexToY(initial, HISTORY_ROW)));
  const nearestRef = useRef(initial);
  const holdingRef = useRef(false);
  const draggingRef = useRef(false);
  const [nearest, setNearest] = useState(initial);
  const [y, setY] = useState(springRef.current.value);
  const [dragging, setDragging] = useState(false);
  const [motion, setMotion] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const downY = useRef(0);
  const history = useRef<{ y: number; t: number }[]>([]);
  const suppressClick = useRef(false);
  const targetRef = useRef(initial);

  function wake(target: number) {
    targetRef.current = target;
    springRef.current.target = indexToY(target, HISTORY_ROW);
    setMotion((count) => count + 1);
  }

  function choose(index: number, nextMode: HistoryMode = mode) {
    const next = clampIndex(index, nodes.length);
    nearestRef.current = next;
    setNearest(next);
    springRef.current.damping = 1;
    springRef.current.response = 0.3;
    springRef.current.velocity = 0;
    wake(next);
    onSelect(next, nextMode);
  }

  useEffect(() => {
    if (holdingRef.current || draggingRef.current) return;
    const index = indexForSelection(nodes, selectedHead);
    if (index === nearestRef.current) return;
    nearestRef.current = index;
    setNearest(index);
    springRef.current.damping = 1;
    springRef.current.response = 0.3;
    springRef.current.velocity = 0;
    wake(index);
  }, [nodes, selectedHead]);

  useEffect(() => {
    let frame = 0;
    let last = 0;
    const loop = (now: number) => {
      const dt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      const spring = springRef.current;
      if (!holdingRef.current && !draggingRef.current) {
        stepSpring(spring, dt, reduced);
      }
      setY(spring.value);
      const busy =
        holdingRef.current ||
        draggingRef.current ||
        !springSettled(spring);
      if (busy) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [reduced, motion]);

  function localY(clientY: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    return clientY - (rect?.top ?? 0);
  }

  function releaseVelocity(): number {
    const samples = history.current;
    if (samples.length < 2) return 0;
    const last = samples[samples.length - 1]!;
    let first = samples[0]!;
    for (let i = samples.length - 1; i >= 0; i--) {
      const sample = samples[i]!;
      if (last.t - sample.t > 80) break;
      first = sample;
    }
    const dt = last.t - first.t;
    if (dt < 8) return 0;
    return ((last.y - first.y) / dt) * 1000;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    trackRef.current?.setPointerCapture(event.pointerId);
    pointerId.current = event.pointerId;
    holdingRef.current = true;
    draggingRef.current = false;
    downY.current = localY(event.clientY);
    springRef.current.velocity = 0;
    history.current = [{ y: springRef.current.value, t: event.timeStamp }];
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerId.current !== event.pointerId) return;
    const pointer = localY(event.clientY);
    if (!draggingRef.current && Math.abs(pointer - downY.current) < 8) return;
    if (!draggingRef.current) {
      draggingRef.current = true;
      suppressClick.current = true;
      setDragging(true);
    }
    const min = indexToY(0, HISTORY_ROW);
    const max = indexToY(nodes.length - 1, HISTORY_ROW);
    const contained = containPosition(pointer, min, max, HISTORY_ROW, reduced);
    const previous = history.current[history.current.length - 1];
    springRef.current.velocity = previous
      ? ((contained - previous.y) / Math.max(8, event.timeStamp - previous.t)) * 1000
      : 0;
    springRef.current.value = contained;
    history.current.push({ y: contained, t: event.timeStamp });
    if (history.current.length > 6) history.current.shift();
    const index = clampIndex(
      Math.round(yToIndex(contained, HISTORY_ROW)),
      nodes.length,
    );
    if (index !== nearestRef.current) {
      nearestRef.current = index;
      setNearest(index);
      onSelect(index, mode);
    }
    setY(contained);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    const wasDragging = draggingRef.current;
    holdingRef.current = false;
    draggingRef.current = false;
    setDragging(false);
    const velocity = releaseVelocity();
    if (!wasDragging) {
      choose(Math.round(yToIndex(localY(event.clientY), HISTORY_ROW)));
      return;
    }
    if (Math.abs(velocity) > 220 && !reduced) {
      const projected = springRef.current.value + projectVelocity(velocity);
      const index = clampIndex(Math.round(yToIndex(projected, HISTORY_ROW)), nodes.length);
      springRef.current.damping = 0.82;
      springRef.current.response = 0.36;
      const remaining = indexToY(index, HISTORY_ROW) - springRef.current.value;
      if (remaining !== 0 && Math.sign(velocity) !== Math.sign(remaining)) {
        springRef.current.velocity = velocity * 0.35;
      } else {
        springRef.current.velocity = velocity;
      }
      nearestRef.current = index;
      setNearest(index);
      wake(index);
      onSelect(index, mode);
      return;
    }
    choose(Math.round(yToIndex(springRef.current.value, HISTORY_ROW)));
  }

  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      chooseRef.current(nearestRef.current + delta);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const node = nodes[nearest];
  const baseY = indexToY(nodes.length - 1, HISTORY_ROW);
  const showInk = mode === "range" && node?.kind !== "base";
  const inkTop = Math.min(y, baseY);
  const spin = node?.kind === "base" ? " rotate(45deg)" : "";
  const caption = historyCaption({
    nodes,
    index: nearest,
    mode,
    baseBranch,
    headOid,
    mergeBase,
    truncated,
  });

  return (
    <div className="history-lane">
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
            onClick={() => {
              onMode("range");
              choose(nearestRef.current, "range");
            }}
          >
            Through here
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "commit"}
            onClick={() => {
              onMode("commit");
              choose(nearestRef.current, "commit");
            }}
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
          {nodes.map((entry, index) => (
            <div
              key={entry.id}
              role="option"
              aria-selected={index === nearest}
              data-history-index={index}
              className={[
                "history-row",
                nodeClass(entry),
                historyNodeDimmed(nodes, index, nearest, mode) ? "is-dim" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                choose(index);
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
