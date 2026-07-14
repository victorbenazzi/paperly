import type { BlockDropPlacement } from "./blockReorder";

export type BlockDropIndicatorBounds = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

const HANDLE_GUTTER_PX = 28;

export function createBlockDropIndicator(doc: Document): HTMLDivElement {
  const indicator = doc.createElement("div");
  indicator.dataset.editorBlockDropIndicator = "";
  Object.assign(indicator.style, {
    position: "fixed",
    zIndex: "1000",
    display: "none",
    height: "1px",
    borderRadius: "999px",
    background: "var(--accent, #2563eb)",
    opacity: "0.55",
    pointerEvents: "none",
    transform: "translateY(-50%)",
    transition: "top 40ms linear, left 40ms linear, width 40ms linear",
  });
  doc.body.appendChild(indicator);
  return indicator;
}

export function positionBlockDropIndicator(
  indicator: HTMLElement,
  bounds: BlockDropIndicatorBounds,
  placement: BlockDropPlacement,
): void {
  const left = bounds.left - HANDLE_GUTTER_PX;
  indicator.style.display = "block";
  indicator.style.top = `${placement === "before" ? bounds.top : bounds.bottom}px`;
  indicator.style.left = `${left}px`;
  indicator.style.width = `${Math.max(0, bounds.right - left)}px`;
}

export function hideBlockDropIndicator(indicator: HTMLElement | null): void {
  if (indicator) indicator.style.display = "none";
}
