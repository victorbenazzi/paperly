import { create } from "zustand";

import { useEditorStore } from "@/features/editor/editor.store";

/**
 * Notion-style navigation: one open note at a time + back/forward history.
 * No tab strip; the quick switcher covers jumping around.
 */
interface NavState {
  openPath: string | null;
  back: string[];
  forward: string[];
  focusRequest: { path: string; target: "title" | "editor" } | null;

  open: (path: string, options?: { focus?: "title" | "editor" }) => Promise<boolean>;
  requestFocus: (path: string, target: "title" | "editor") => void;
  consumeFocus: (path: string, target: "title" | "editor") => boolean;
  close: () => void;
  goBack: () => Promise<boolean>;
  goForward: () => Promise<boolean>;
  /** A rename/move changed the open note's path; follow it without history noise. */
  remap: (from: string, to: string) => void;
}

let navigationRequest = 0;

async function flushBeforeNavigation(path: string): Promise<boolean> {
  const editor = useEditorStore.getState();
  if (!editor.path || editor.path === path) return true;
  const result = await editor.saveNow(editor.sessionId);
  return result.ok || result.reason === "readOnly";
}

export const useNavStore = create<NavState>((set, get) => ({
  openPath: null,
  back: [],
  forward: [],
  focusRequest: null,

  open: async (path, options) => {
    const { openPath, back } = get();
    const focusRequest = options?.focus ? { path, target: options.focus } : null;
    if (openPath === path) {
      if (focusRequest) set({ focusRequest });
      return true;
    }
    const request = ++navigationRequest;
    if (!(await flushBeforeNavigation(path))) return false;
    if (request !== navigationRequest || get().openPath !== openPath) return false;
    set({
      openPath: path,
      back: openPath ? [...back, openPath] : back,
      forward: [],
      focusRequest,
    });
    return true;
  },

  requestFocus: (path, target) => set({ focusRequest: { path, target } }),

  consumeFocus: (path, target) => {
    const request = get().focusRequest;
    if (!request || request.path !== path || request.target !== target) return false;
    set({ focusRequest: null });
    return true;
  },

  close: () => {
    navigationRequest += 1;
    set({ openPath: null, back: [], forward: [], focusRequest: null });
  },

  goBack: async () => {
    const { openPath, back, forward } = get();
    const prev = back[back.length - 1];
    if (!prev) return false;
    const request = ++navigationRequest;
    if (!(await flushBeforeNavigation(prev))) return false;
    if (request !== navigationRequest || get().openPath !== openPath) return false;
    set({
      openPath: prev,
      back: back.slice(0, -1),
      forward: openPath ? [openPath, ...forward] : forward,
      focusRequest: null,
    });
    return true;
  },

  goForward: async () => {
    const { openPath, back, forward } = get();
    const next = forward[0];
    if (!next) return false;
    const request = ++navigationRequest;
    if (!(await flushBeforeNavigation(next))) return false;
    if (request !== navigationRequest || get().openPath !== openPath) return false;
    set({
      openPath: next,
      forward: forward.slice(1),
      back: openPath ? [...back, openPath] : back,
      focusRequest: null,
    });
    return true;
  },

  remap: (from, to) => {
    const { openPath, back, forward } = get();
    const swap = (p: string) => (p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p);
    set({
      openPath: openPath ? swap(openPath) : openPath,
      back: back.map(swap),
      forward: forward.map(swap),
      focusRequest: get().focusRequest
        ? { ...get().focusRequest!, path: swap(get().focusRequest!.path) }
        : null,
    });
  },
}));
