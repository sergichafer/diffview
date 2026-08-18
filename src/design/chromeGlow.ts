import { CHROME_GLOW } from "./choice";

function distanceToRect(px: number, py: number, rect: DOMRect): number {
  const x = Math.max(rect.left, Math.min(px, rect.right));
  const y = Math.max(rect.top, Math.min(py, rect.bottom));
  return Math.hypot(px - x, py - y);
}

/** 0 when the pointer is a shell-diagonal away, 1 when it is on the element. */
function pointerProximity(distance: number, falloff: number): number {
  const t = Math.max(0, 1 - distance / falloff);
  return Math.pow(t, 0.55);
}

export function attachChromeGlow(root: HTMLElement): () => void {
  let target: HTMLElement | null = null;

  const getTarget = (): HTMLElement | null => {
    if (target && root.contains(target)) return target;
    target = root.querySelector(CHROME_GLOW.targets);
    if (target) target.classList.add("compare-trigger-glow");
    return target;
  };

  const falloff =
    Math.hypot(root.clientWidth, root.clientHeight) * CHROME_GLOW.falloffScale;

  const update = (clientX: number, clientY: number): void => {
    const node = getTarget();
    if (!node) return;

    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle =
      Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI) + 90;
    const distance = distanceToRect(clientX, clientY, rect);
    const proximity = pointerProximity(distance, falloff);

    // Only angle and proximity: the resting floor is the theme's, and an inline
    // opacity here would beat every per-theme rule that tries to raise it.
    node.style.setProperty("--glow-angle", `${angle}deg`);
    node.style.setProperty("--glow-proximity", proximity.toFixed(3));
  };

  const onPointerMove = (event: PointerEvent): void => {
    update(event.clientX, event.clientY);
  };

  window.addEventListener("pointermove", onPointerMove, { passive: true });

  const seed = root.getBoundingClientRect();
  update(seed.left + seed.width * 0.5, seed.top + seed.height * 0.35);

  return () => {
    window.removeEventListener("pointermove", onPointerMove);
  };
}
