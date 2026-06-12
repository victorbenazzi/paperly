import { create } from "zustand";

import type { TreeNode } from "./tree.types";

/**
 * Pointer-event drag state for moving tree nodes. HTML5 drag is off the table:
 * WKWebView silently cancels dragstart through composed Radix Slots.
 */
interface DragState {
  dragging: TreeNode | null;
  /** Dir path currently highlighted as the drop target (or vault root). */
  dropDir: string | null;
  /** Pointer position, drives the floating drag ghost. */
  x: number;
  y: number;

  begin: (node: TreeNode, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  hover: (dir: string | null) => void;
  end: () => void;
}

export const useDragStore = create<DragState>((set) => ({
  dragging: null,
  dropDir: null,
  x: 0,
  y: 0,
  begin: (node, x, y) => set({ dragging: node, dropDir: null, x, y }),
  move: (x, y) => set({ x, y }),
  hover: (dir) => set({ dropDir: dir }),
  end: () => {
    endedAt = Date.now();
    set({ dragging: null, dropDir: null });
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
