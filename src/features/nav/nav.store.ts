import { create } from "zustand";

/**
 * Notion-style navigation: one open note at a time + back/forward history.
 * No tab strip; the quick switcher covers jumping around.
 */
interface NavState {
  openPath: string | null;
  back: string[];
  forward: string[];

  open: (path: string) => void;
  close: () => void;
  goBack: () => void;
  goForward: () => void;
  /** A rename/move changed the open note's path; follow it without history noise. */
  remap: (from: string, to: string) => void;
}

export const useNavStore = create<NavState>((set, get) => ({
  openPath: null,
  back: [],
  forward: [],

  open: (path) => {
    const { openPath, back } = get();
    if (openPath === path) return;
    set({
      openPath: path,
      back: openPath ? [...back, openPath] : back,
      forward: [],
    });
  },

  close: () => set({ openPath: null, back: [], forward: [] }),

  goBack: () => {
    const { openPath, back, forward } = get();
    const prev = back[back.length - 1];
    if (!prev) return;
    set({
      openPath: prev,
      back: back.slice(0, -1),
      forward: openPath ? [openPath, ...forward] : forward,
    });
  },

  goForward: () => {
    const { openPath, back, forward } = get();
    const next = forward[0];
    if (!next) return;
    set({
      openPath: next,
      forward: forward.slice(1),
      back: openPath ? [...back, openPath] : back,
    });
  },

  remap: (from, to) => {
    const { openPath, back, forward } = get();
    const swap = (p: string) => (p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p);
    set({
      openPath: openPath ? swap(openPath) : openPath,
      back: back.map(swap),
      forward: forward.map(swap),
    });
  },
}));
