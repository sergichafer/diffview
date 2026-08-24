import type { ReactNode } from "react";
import { truncateLabel } from "@/shared/truncateLabel";
import type { GraphTopology } from "./graphTopology";

const VIEW_W = 248;
const VIEW_H = 220;
const Y0 = 22;
const Y1 = VIEW_H - 28;
const X_AHEAD = VIEW_W * 0.36;
const X_BEHIND = VIEW_W * 0.64;
const X_JOIN = (X_AHEAD + X_BEHIND) / 2;
const GRAPH_LABEL_CHARS = 16;
const MAX_INTERMEDIATE_DOTS = 8;

function intermediateDotCount(commitCount: number): number {
  if (commitCount <= 1) return 0;
  return Math.min(commitCount - 1, MAX_INTERMEDIATE_DOTS);
}

function Node({
  cx,
  cy,
  fill,
  r = 4.5,
  role,
}: {
  cx: number;
  cy: number;
  fill: string;
  r?: number;
  role?: string;
}) {
  return <circle cx={cx} cy={cy} r={r} fill={fill} data-graph-node={role} />;
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
      data-graph-node="wip"
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
      data-graph-node="merge-base"
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
  isLive: boolean;
}

function graphBody(topology: GraphTopology, isLive: boolean): ReactNode {
  const success = "var(--state-success)";
  const danger = "var(--state-danger)";
  const baseLabel = topology.baseLabel
    ? truncateLabel(topology.baseLabel, GRAPH_LABEL_CHARS)
    : "base";

  switch (topology.kind) {
    case "unknown": {
      const y = (Y0 + Y1) / 2;
      return (
        <>
          <Diamond cx={X_JOIN} cy={y} />
          {isLive ? <Hollow cx={X_JOIN} cy={y} /> : null}
          <Label x={X_JOIN} y={y + 22} text="counts pending" anchor="middle" />
        </>
      );
    }
    case "sync": {
      const y = (Y0 + Y1) / 2;
      return (
        <>
          <Diamond cx={X_JOIN} cy={y} />
          {isLive ? <Hollow cx={X_JOIN} cy={y} /> : null}
          <Label x={X_JOIN + 12} y={y - 4} text="HEAD" anchor="start" />
          <Label x={X_JOIN + 12} y={y + 12} text="merge-base" anchor="start" />
        </>
      );
    }
    case "linear":
      return (
        <>
          <path
            d={`M ${X_AHEAD} ${Y0} V ${Y1}`}
            stroke={success}
            strokeWidth={1.6}
            fill="none"
          />
          <Diamond cx={X_AHEAD} cy={Y1} />
          {laneDots(intermediateDotCount(topology.ahead), X_AHEAD, Y0, Y1, success)}
          <Node cx={X_AHEAD} cy={Y0} fill={success} r={5} role="head" />
          {isLive ? <Hollow cx={X_AHEAD} cy={Y0} /> : null}
          <Label x={X_AHEAD + 12} y={Y1 + 4} text={baseLabel} anchor="start" />
          <Label x={X_AHEAD + 12} y={Y0 + 4} text="HEAD" anchor="start" />
        </>
      );
    case "behind":
      return (
        <>
          <path
            d={`M ${X_AHEAD} ${Y1} V ${Y1 - 16} C ${X_AHEAD} ${Y1 - 40}, ${X_BEHIND} ${Y1 - 48}, ${X_BEHIND} ${Y1 - 80} V ${Y0}`}
            stroke={danger}
            strokeWidth={1.6}
            fill="none"
          />
          <Diamond cx={X_AHEAD} cy={Y1} />
          {laneDots(
            intermediateDotCount(topology.behind),
            X_BEHIND,
            Y0,
            Y1 - 80,
            danger,
          )}
          <Node cx={X_BEHIND} cy={Y0} fill={danger} r={5} role="head" />
          {isLive ? <Hollow cx={X_AHEAD} cy={Y1} /> : null}
          <Label x={8} y={Y1 + 4} text="HEAD" anchor="start" />
          <Label x={X_BEHIND + 10} y={Y0 + 4} text={baseLabel} anchor="start" />
        </>
      );
    case "diverged":
      return (
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
          {laneDots(
            intermediateDotCount(topology.ahead),
            X_AHEAD,
            Y0,
            Y1 - 64,
            success,
          )}
          {laneDots(
            intermediateDotCount(topology.behind),
            X_BEHIND,
            Y0 + 8,
            Y1 - 64,
            danger,
          )}
          <Node cx={X_BEHIND} cy={Y0 + 8} fill={danger} r={5} role="head" />
          <Node cx={X_AHEAD} cy={Y0} fill={success} r={5} role="head" />
          {isLive ? <Hollow cx={X_AHEAD} cy={Y0} /> : null}
          <Label x={8} y={Y1 + 12} text="merge-base" anchor="start" />
          <Label x={X_AHEAD - 6} y={Y0 - 8} text="HEAD" anchor="end" />
          <Label x={X_BEHIND + 10} y={Y0 + 12} text={baseLabel} anchor="start" />
        </>
      );
  }
}

export function CompareGraphSvg({ topology, isLive }: CompareGraphSvgProps) {
  return (
    <svg
      className="compare-graph-svg"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {graphBody(topology, isLive)}
    </svg>
  );
}
