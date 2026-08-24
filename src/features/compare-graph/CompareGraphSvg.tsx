import type { ReactNode } from "react";
import { truncateBranchLabel } from "@/features/branch-compare/branchLabel";
import type { GraphTopology } from "./graphTopology";

const VIEW_W = 248;
const VIEW_H = 220;
const Y0 = 22;
const Y1 = VIEW_H - 28;
const X_AHEAD = VIEW_W * 0.36;
const X_BEHIND = VIEW_W * 0.64;
const X_JOIN = (X_AHEAD + X_BEHIND) / 2;

function Node({
  cx,
  cy,
  fill,
  r = 4.5,
}: {
  cx: number;
  cy: number;
  fill: string;
  r?: number;
}) {
  return <circle cx={cx} cy={cy} r={r} fill={fill} />;
}

function Hollow({ cx, cy }: { cx: number; cy: number }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5.2}
      fill="none"
      stroke="var(--state-info)"
      strokeWidth={1.6}
    />
  );
}

function Diamond({ cx, cy }: { cx: number; cy: number }) {
  return (
    <rect
      x={cx - 4}
      y={cy - 4}
      width={8}
      height={8}
      rx={1}
      fill="var(--state-merge)"
      transform={`rotate(45 ${cx} ${cy})`}
    />
  );
}

function Label({
  x,
  y,
  text,
  anchor = "middle",
}: {
  x: number;
  y: number;
  text: string;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <text
      x={x}
      y={y}
      fill="var(--fg-muted)"
      fontSize={10}
      fontFamily="var(--font-ui, system-ui, sans-serif)"
      textAnchor={anchor}
    >
      {text}
    </text>
  );
}

function laneDots(
  count: number,
  x: number,
  yTip: number,
  yBase: number,
  fill: string,
) {
  if (count <= 0) return null;
  const step = (yBase - yTip) / (count + 1);
  const dots = [];
  for (let i = 1; i <= count; i++) {
    dots.push(
      <Node
        key={`${fill}-${i}`}
        cx={x}
        cy={yBase - step * i}
        fill={fill}
        r={3.2}
      />,
    );
  }
  return dots;
}

interface CompareGraphSvgProps {
  topology: GraphTopology;
}

export function CompareGraphSvg({ topology }: CompareGraphSvgProps) {
  const success = "var(--state-success)";
  const danger = "var(--state-danger)";
  const baseLabel = topology.baseLabel
    ? truncateBranchLabel(topology.baseLabel, 16)
    : "base";
  const live = topology.isLive;

  let body: ReactNode;
  if (topology.kind === "sync") {
    body = (
      <>
        <path
          d={`M ${X_AHEAD} ${Y0} V ${Y1}`}
          stroke={success}
          strokeWidth={1.6}
          fill="none"
        />
        <Diamond cx={X_AHEAD} cy={Y1} />
        <Node cx={X_AHEAD} cy={Y0} fill={success} r={5} />
        {live ? <Hollow cx={X_AHEAD} cy={Y0} /> : null}
        <Label x={X_AHEAD + 12} y={Y1 + 4} text="merge-base" anchor="start" />
        <Label x={X_AHEAD + 12} y={Y0 + 4} text="HEAD" anchor="start" />
      </>
    );
  } else if (topology.kind === "linear") {
    body = (
      <>
        <path
          d={`M ${X_AHEAD} ${Y0} V ${Y1}`}
          stroke={success}
          strokeWidth={1.6}
          fill="none"
        />
        <Diamond cx={X_AHEAD} cy={Y1} />
        {laneDots(topology.drawnAhead, X_AHEAD, Y0, Y1, success)}
        <Node cx={X_AHEAD} cy={Y0} fill={success} r={5} />
        {live ? <Hollow cx={X_AHEAD} cy={Y0} /> : null}
        <Label x={X_AHEAD + 12} y={Y1 + 4} text={baseLabel} anchor="start" />
        <Label x={X_AHEAD + 12} y={Y0 + 4} text="HEAD" anchor="start" />
      </>
    );
  } else if (topology.kind === "behind") {
    body = (
      <>
        <path
          d={`M ${X_AHEAD} ${Y1} V ${Y1 - 16} C ${X_AHEAD} ${Y1 - 40}, ${X_BEHIND} ${Y1 - 48}, ${X_BEHIND} ${Y1 - 80} V ${Y0}`}
          stroke={danger}
          strokeWidth={1.6}
          fill="none"
        />
        <Diamond cx={X_AHEAD} cy={Y1} />
        <Node cx={X_AHEAD} cy={Y1} fill={success} r={5} />
        {laneDots(topology.drawnBehind, X_BEHIND, Y0, Y1 - 80, danger)}
        <Node cx={X_BEHIND} cy={Y0} fill={danger} r={5} />
        {live ? <Hollow cx={X_AHEAD} cy={Y1} /> : null}
        <Label x={8} y={Y1 + 4} text="HEAD" anchor="start" />
        <Label
          x={X_BEHIND + 10}
          y={Y0 + 4}
          text={baseLabel}
          anchor="start"
        />
      </>
    );
  } else {
    body = (
      <>
        <path
          d={`M ${X_JOIN} ${Y1} C ${X_JOIN} ${Y1 - 28}, ${X_BEHIND} ${Y1 - 36}, ${X_BEHIND} ${Y1 - 64} V ${Y0 + 8}`}
          stroke={danger}
          strokeWidth={1.6}
          fill="none"
        />
        <path
          d={`M ${X_JOIN} ${Y1} C ${X_JOIN} ${Y1 - 28}, ${X_AHEAD} ${Y1 - 36}, ${X_AHEAD} ${Y1 - 64} V ${Y0}`}
          stroke={success}
          strokeWidth={1.6}
          fill="none"
        />
        <Diamond cx={X_JOIN} cy={Y1} />
        {laneDots(topology.drawnAhead, X_AHEAD, Y0, Y1 - 64, success)}
        {laneDots(topology.drawnBehind, X_BEHIND, Y0 + 8, Y1 - 64, danger)}
        <Node cx={X_BEHIND} cy={Y0 + 8} fill={danger} r={5} />
        <Node cx={X_AHEAD} cy={Y0} fill={success} r={5} />
        {live ? <Hollow cx={X_AHEAD} cy={Y0} /> : null}
        <Label x={8} y={Y1 + 12} text="merge-base" anchor="start" />
        <Label x={X_AHEAD - 6} y={Y0 - 8} text="HEAD" anchor="end" />
        <Label
          x={X_BEHIND + 10}
          y={Y0 + 12}
          text={baseLabel}
          anchor="start"
        />
      </>
    );
  }

  return (
    <svg
      className="compare-graph-svg"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}
