import { create } from "zustand";

/** A heading in the open note, in document order. */
export interface OutlineHeading {
  /** BlockNote block id; the DOM node carries it as `data-id`. */
  id: string;
  text: string;
  level: number;
}

/**
 * Outline of the open note, fed by the editor on every change and rendered
 * by the right-edge rail (Notion-style bars + hover panel).
 */
interface OutlineState {
  headings: OutlineHeading[];
  set: (headings: OutlineHeading[]) => void;
  clear: () => void;
}

export const useOutlineStore = create<OutlineState>((set) => ({
  headings: [],
  set: (headings) => set({ headings }),
  clear: () => set({ headings: [] }),
}));
