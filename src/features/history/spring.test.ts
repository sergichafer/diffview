import { describe, expect, test } from "bun:test";
import {
  containPosition,
  createSpring,
  indexToY,
  projectVelocity,
  springSettled,
  stepSpring,
  yToIndex,
} from "./spring";

describe("stepSpring", () => {
  test("a resting spring settles on the target without passing it", () => {
    const spring = createSpring(0);
    spring.target = 100;
    spring.damping = 1;
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      stepSpring(spring, 1 / 60, false);
      peak = Math.max(peak, spring.value);
    }
    expect(springSettled(spring)).toBe(true);
    expect(spring.value).toBeGreaterThan(99);
    expect(peak).toBeLessThanOrEqual(100.5);
  });

  test("reduced motion snaps", () => {
    const spring = createSpring(10);
    spring.target = 40;
    spring.velocity = 500;
    stepSpring(spring, 1 / 60, true);
    expect(spring.value).toBe(40);
    expect(spring.velocity).toBe(0);
  });
});

describe("projection and rubber band", () => {
  test("a flick lands past the release point", () => {
    expect(projectVelocity(1000, 0.99)).toBeCloseTo(99, 5);
  });

  test("past the end the position still moves, less than the finger", () => {
    const contained = containPosition(200, 0, 100, 52, false);
    expect(contained).toBeGreaterThan(100);
    expect(contained).toBeLessThan(200);
  });

  test("row centers round back to their index", () => {
    expect(Math.round(yToIndex(indexToY(3, 52), 52))).toBe(3);
  });
});
