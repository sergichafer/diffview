import type { PointerEvent as ReactPointerEvent } from "react";

function pressHit(
  event: ReactPointerEvent<HTMLElement>,
): HTMLElement | null {
  const hit = (event.target as Element | null)?.closest("[data-press]");
  if (!(hit instanceof HTMLElement)) return null;
  if (!event.currentTarget.contains(hit)) return null;
  return hit;
}

function clearPressed(root: HTMLElement) {
  root.querySelectorAll(".is-pressed").forEach((el) => {
    el.classList.remove("is-pressed");
  });
}

export function onPressPointerDown(e: ReactPointerEvent<HTMLElement>) {
  if (e.button !== 0) return;
  const hit = pressHit(e);
  if (!hit) return;
  hit.classList.add("is-pressed");
  try {
    hit.setPointerCapture(e.pointerId);
  } catch {
    /* capture is best-effort; class still clears on up/cancel */
  }
}

export function onPressPointerRelease(e: ReactPointerEvent<HTMLElement>) {
  clearPressed(e.currentTarget);
}
