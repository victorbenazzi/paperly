import { create } from "zustand";

import { CMD, ipc, type TextFile } from "@/lib/ipc";
import { splitFrontmatter } from "@/features/editor/markdown/frontmatter";

/**
 * Lazy cache of page icons (frontmatter `icon`) keyed by absolute .md path.
 * The tree and the breadcrumb read from here; entries load on demand the
 * first time a row asks for one.
 *
 * `undefined` = not loaded yet; `null` = loaded, no icon (or unreadable).
 */
interface PageMetaState {
  icons: Record<string, string | null>;

  /** Load the icon for a page if we have not tried yet. */
  request: (path: string) => void;
  /** Local update after an in-app icon change (avoids a disk round-trip). */
  setIcon: (path: string, icon: string | null) => void;
  /** A rename/move changed paths; carry cached icons over. */
  remap: (from: string, to: string) => void;
  /** Watcher events: drop affected entries so they reload on next request. */
  handleFsChange: (paths: string[]) => void;
  reset: () => void;
}

const inflight = new Set<string>();

export const usePageMetaStore = create<PageMetaState>((set, get) => ({
  icons: {},

  request: (path) => {
    if (get().icons[path] !== undefined || inflight.has(path)) return;
    inflight.add(path);
    void ipc<TextFile>(CMD.readFileText, { path })
      .then((file) => {
        const { meta } = splitFrontmatter(file.content);
        const icon = typeof meta.icon === "string" && meta.icon.trim() ? meta.icon : null;
        set((s) => ({ icons: { ...s.icons, [path]: icon } }));
      })
      .catch(() => {
        set((s) => ({ icons: { ...s.icons, [path]: null } }));
      })
      .finally(() => {
        inflight.delete(path);
      });
  },

  setIcon: (path, icon) => set((s) => ({ icons: { ...s.icons, [path]: icon } })),

  remap: (from, to) =>
    set((s) => {
      const icons: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(s.icons)) {
        const next =
          key === from ? to : key.startsWith(`${from}/`) ? to + key.slice(from.length) : key;
        icons[next] = value;
      }
      return { icons };
    }),

  handleFsChange: (paths) =>
    set((s) => {
      const icons = { ...s.icons };
      let changed = false;
      for (const key of Object.keys(icons)) {
        if (paths.some((p) => key === p || key.startsWith(`${p}/`))) {
          delete icons[key];
          changed = true;
        }
      }
      return changed ? { icons } : s;
    }),

  reset: () => set({ icons: {} }),
}));
