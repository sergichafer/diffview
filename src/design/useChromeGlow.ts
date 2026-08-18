import { useEffect } from "react";
import { attachChromeGlow } from "./chromeGlow";

/** Pointer-tracked ring on the compare prism. Every theme. */
export function useChromeGlow(rootRef: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return attachChromeGlow(root);
  }, [rootRef]);
}
