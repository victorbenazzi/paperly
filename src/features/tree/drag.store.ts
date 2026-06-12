import { create } from "zustand";

import type { TreeNode } from "./tree.types";

/** Insertion point between siblings, shown as a horizontal line. */
export interface DropLine {
  /** Dir whose manual order receives the dragged node. */
  parentDir: string;
  /** Sibling display name the drop lands next to; null means "first child". */
  anchorName: string | null;
  place: "before" | "after" | "first";
  /** Row that renders the line and on which edge. */
  rowPath: string;
  rowEdge: "above" | "below";
  /** Extra indent level for the "first child of an open folder" line. */
  indented: boolean;
}

export type DropTarget =
  | { kind: "into"; dir: string }
  | { kind: "line"; line: DropLine };

/**
 * Pointer-event drag state for moving tree nodes. HTML5 drag is off the table:
 * WKWebView silently cancels dragstart through composed Radix Slots.
 */
interface DragState {
  dragging: TreeNode | null;
  /** Where a drop would land right now: a dir, an insertion line, or nowhere. */
  target: DropTarget | null;
  /** Pointer position, drives the floating drag ghost. */
  x: number;
  y: number;

  begin: (node: TreeNode, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  hover: (target: DropTarget | null) => void;
  end: () => void;
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind === "into" && b.kind === "into") return a.dir === b.dir;
  if (a.kind === "line" && b.kind === "line") {
    const x = a.line;
    const y = b.line;
    return (
      x.parentDir === y.parentDir &&
      x.anchorName === y.anchorName &&
      x.place === y.place &&
      x.rowPath === y.rowPath &&
      x.rowEdge === y.rowEdge &&
      x.indented === y.indented
    );
  }
  return false;
}

export const useDragStore = create<DragState>((set) => ({
  dragging: null,
  target: null,
  x: 0,
  y: 0,
  begin: (node, x, y) => set({ dragging: node, target: null, x, y }),
  move: (x, y) => set({ x, y }),
  // hover fires on every pointermove with a freshly-built target; keep the
  // previous object when nothing changed so rows don't re-render per pixel.
  hover: (target) => set((s) => (sameTarget(s.target, target) ? s : { target })),
  end: () => {
    endedAt = Date.now();
    set({ dragging: null, target: null });
  },
}));

let endedAt = 0;

/**
 * Pointer capture keeps the click event on the drag-source row, so a drop
 * is followed by a click that would open the dragged note. Rows use this to
 * swallow that click.
 */
export function dragJustEnded(): boolean {
  return Date.now() - endedAt < 200;
}
