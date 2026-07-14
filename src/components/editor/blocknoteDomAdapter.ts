import type { BlockDropIndicatorBounds } from "./blockDropIndicator";
import type { BlockDropGeometry } from "./blockReorder";

export interface BlockDomSnapshot {
  candidates: BlockDropGeometry[];
  bounds: Map<string, BlockDropIndicatorBounds>;
}

export function isDragHandle(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".bn-block-drag-handle"));
}

export function findBlockElement(editorRoot: HTMLElement, blockId: string): HTMLElement | null {
  try {
    return (
      Array.from(editorRoot.querySelectorAll<HTMLElement>(".bn-block-outer[data-id]")).find(
        (element) => element.dataset.id === blockId,
      ) ?? null
    );
  } catch {
    return null;
  }
}

function blockRowBounds(element: HTMLElement): BlockDropIndicatorBounds | null {
  try {
    const row = Array.from(element.children).find((child) => child.classList.contains("bn-block"));
    const rect = (row ?? element).getBoundingClientRect();
    if (![rect.top, rect.bottom, rect.left, rect.right].every(Number.isFinite)) return null;
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
  } catch {
    return null;
  }
}

export function captureBlockDomSnapshot(
  editorRoot: HTMLElement,
  canUse: (id: string) => boolean,
): BlockDomSnapshot {
  const snapshot: BlockDomSnapshot = { candidates: [], bounds: new Map() };
  let elements: HTMLElement[];
  try {
    elements = Array.from(editorRoot.querySelectorAll<HTMLElement>(".bn-block-outer[data-id]"));
  } catch {
    return snapshot;
  }

  for (const element of elements) {
    const id = element.dataset.id;
    if (!id || !canUse(id)) continue;
    const bounds = blockRowBounds(element);
    if (!bounds) continue;
    snapshot.candidates.push({ id, top: bounds.top, bottom: bounds.bottom });
    snapshot.bounds.set(id, bounds);
  }
  return snapshot;
}
