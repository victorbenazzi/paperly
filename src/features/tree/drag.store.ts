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

  begin: (node: TreeNode) => void;
  hover: (dir: string | null) => void;
  end: () => void;
}

export const useDragStore = create<DragState>((set) => ({
  dragging: null,
  dropDir: null,
  begin: (node) => set({ dragging: node, dropDir: null }),
  hover: (dir) => set({ dropDir: dir }),
  end: () => set({ dragging: null, dropDir: null }),
}));
