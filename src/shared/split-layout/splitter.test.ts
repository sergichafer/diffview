import { describe, expect, test } from "bun:test";
import {
  clampSplitterWidth,
  rubberband,
  rubberbandedWidth,
  SPLITTER_MAX_WIDTH,
  SPLITTER_MIN_WIDTH,
} from "./splitter";

describe("rubberband", () => {
  test("zero overshoot is zero", () => {
    expect(rubberband(0, 100)).toBe(0);
  });

  test("non-positive dimension yields zero", () => {
    expect(rubberband(40, 0)).toBe(0);
    expect(rubberband(40, -10)).toBe(0);
  });

  test("matches the overshoot formula", () => {
    const overshoot = 100;
    const dimension = 100;
    const constant = 0.55;
    expect(rubberband(overshoot, dimension, constant)).toBe(
      (overshoot * dimension * constant) /
        (dimension + constant * Math.abs(overshoot)),
    );
  });

  test("is odd (sign-preserving) in overshoot", () => {
    expect(rubberband(-80, 200)).toBe(-rubberband(80, 200));
  });

  test("resists more as overshoot grows", () => {
    const dim = 240;
    const small = rubberband(40, dim);
    const large = rubberband(400, dim);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(40);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThan(400);
    expect(large / 400).toBeLessThan(small / 40);
  });
});

describe("rubberbandedWidth", () => {
  const min = SPLITTER_MIN_WIDTH;
  const max = SPLITTER_MAX_WIDTH;

  test("passes through values inside the range", () => {
    expect(rubberbandedWidth(240, min, max)).toBe(240);
    expect(rubberbandedWidth(min, min, max)).toBe(min);
    expect(rubberbandedWidth(max, min, max)).toBe(max);
  });

  test("does not hard-clamp past max", () => {
    const raw = max + 120;
    const live = rubberbandedWidth(raw, min, max);
    expect(live).toBeGreaterThan(max);
    expect(live).toBeLessThan(raw);
    expect(clampSplitterWidth(live, min, max)).toBe(max);
  });

  test("does not hard-clamp past min", () => {
    const raw = min - 80;
    const live = rubberbandedWidth(raw, min, max);
    expect(live).toBeLessThan(min);
    expect(live).toBeGreaterThan(raw);
    expect(clampSplitterWidth(live, min, max)).toBe(min);
  });

  test("uses max-min as default dimension", () => {
    const raw = max + 50;
    const range = max - min;
    expect(rubberbandedWidth(raw, min, max)).toBe(
      max + rubberband(50, range),
    );
  });
});
