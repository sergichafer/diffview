export const SPLITTER_MIN_WIDTH = 200;
export const SPLITTER_MAX_WIDTH = 520;
export const SPLITTER_STEP = 16;

export const WORKSPACES_MIN_WIDTH = 200;
export const WORKSPACES_MAX_WIDTH = 360;
export const WORKSPACES_RAIL_WIDTH = 48;

export const RUBBERBAND_CONSTANT = 0.55;

export function clampSplitterWidth(
  width: number,
  min: number = SPLITTER_MIN_WIDTH,
  max: number = SPLITTER_MAX_WIDTH,
): number {
  return Math.min(Math.max(width, min), max);
}

/** Progressive resistance past an edge. */
export function rubberband(
  overshoot: number,
  dimension: number,
  constant: number = RUBBERBAND_CONSTANT,
): number {
  if (overshoot === 0 || dimension <= 0) return 0;
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}

/** Live splitter width: 1:1 inside min/max, rubberbanded past the edges. */
export function rubberbandedWidth(
  rawWidth: number,
  min: number,
  max: number,
  dimension: number = Math.max(max - min, 1),
): number {
  if (rawWidth < min) {
    return min + rubberband(rawWidth - min, dimension);
  }
  if (rawWidth > max) {
    return max + rubberband(rawWidth - max, dimension);
  }
  return rawWidth;
}
