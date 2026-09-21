export type Spring = {
  value: number;
  velocity: number;
  target: number;
  damping: number;
  response: number;
};

export function createSpring(value: number): Spring {
  return { value, velocity: 0, target: value, damping: 1, response: 0.32 };
}

export function stepSpring(spring: Spring, dt: number, reducedMotion: boolean): void {
  if (reducedMotion) {
    spring.value = spring.target;
    spring.velocity = 0;
    return;
  }
  const step = Math.min(Math.max(dt, 0), 0.032);
  const omega = (2 * Math.PI) / spring.response;
  const offset = spring.value - spring.target;
  const accel = -omega * omega * offset - 2 * spring.damping * omega * spring.velocity;
  spring.velocity += accel * step;
  spring.value += spring.velocity * step;
}

export function springSettled(spring: Spring): boolean {
  return Math.abs(spring.value - spring.target) < 0.4 && Math.abs(spring.velocity) < 8;
}

/** Exponential decay projection, deceleration 0.99 for a short list. */
export function projectVelocity(velocity: number, deceleration = 0.99): number {
  return (velocity / 1000) * deceleration / (1 - deceleration);
}

export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export function containPosition(
  y: number,
  min: number,
  max: number,
  row: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return Math.max(min, Math.min(max, y));
  if (y < min) return min - rubberband(min - y, row * 1.6);
  if (y > max) return max + rubberband(y - max, row * 1.6);
  return y;
}

export function indexToY(index: number, row: number): number {
  return (index + 0.5) * row;
}

export function yToIndex(y: number, row: number): number {
  return y / row - 0.5;
}
