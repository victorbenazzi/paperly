import { create } from "zustand";

import { CMD, ipc, type DirEntry } from "@/lib/ipc";
import { isMarkdown, stripMdExt } from "./tree.types";

/**
 * Flat directory cache keyed by absolute dir path, loaded lazily on expand.
 * No nested tree in memory: invalidation is "drop the dir, re-list if visible".
 */
interface TreeState {
  dirCache: Record<string, DirEntry[]>;
  expanded: Set<string>;
  selectedPath: string | null;
  /** Inline editor state: a node being renamed, or a new item being named. */
  renamingPath: string | null;

  loadDir: (dirPath: string) => Promise<void>;
  toggleExpanded: (dirPath: string) => void;
  setExpanded: (dirs: string[]) => void;
  select: (path: string | null) => void;
  startRename: (path: string | null) => void;
  /** Drop cached listings for these dirs and re-list the ones still loaded. */
  invalidateDirs: (dirPaths: string[]) => Promise<void>;
  reset: () => void;

  createNote: (parentDir: string, baseName: string) => Promise<string>;
  createFolder: (parentDir: string, name: string) => Promise<string>;
  /** Rename a page: renames `X.md` and, for folder notes, the companion `X/`. */
  renameNode: (
    path: string,
    dirPath: string | null,
    newDisplayName: string,
  ) => Promise<string>;
  deleteNode: (path: string, dirPath: string | null) => Promise<void>;
  moveNode: (path: string, dirPath: string | null, targetDir: string) => Promise<string>;
}

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

async function listDir(dirPath: string): Promise<DirEntry[]> {
  return ipc<DirEntry[]>(CMD.readDir, { path: dirPath });
}

export const useTreeStore = create<TreeState>((set, get) => ({
  dirCache: {},
  expanded: new Set<string>(),
  selectedPath: null,
  renamingPath: null,

  loadDir: async (dirPath) => {
    const entries = await listDir(dirPath);
    set((s) => ({ dirCache: { ...s.dirCache, [dirPath]: entries } }));
  },

  toggleExpanded: (dirPath) => {
    set((s) => {
      const expanded = new Set(s.expanded);
      if (expanded.has(dirPath)) expanded.delete(dirPath);
      else expanded.add(dirPath);
      return { expanded };
    });
    if (get().expanded.has(dirPath) && !get().dirCache[dirPath]) {
      void get().loadDir(dirPath);
    }
  },

  setExpanded: (dirs) => {
    set({ expanded: new Set(dirs) });
    for (const d of dirs) {
      if (!get().dirCache[d]) void get().loadDir(d);
    }
  },

  select: (path) => set({ selectedPath: path }),
  startRename: (path) => set({ renamingPath: path }),

  invalidateDirs: async (dirPaths) => {
    const { dirCache } = get();
    const toReload = dirPaths.filter((d) => dirCache[d] !== undefined);
    await Promise.all(toReload.map((d) => get().loadDir(d)));
  },

  reset: () =>
    set({ dirCache: {}, expanded: new Set(), selectedPath: null, renamingPath: null }),

  createNote: async (parentDir, baseName) => {
    const entries = get().dirCache[parentDir] ?? (await listDir(parentDir));
    const taken = new Set(
      entries.filter((e) => isMarkdown(e.name)).map((e) => stripMdExt(e.name).toLowerCase()),
    );
    let name = baseName;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${baseName} ${n}`;
    const path = await ipc<string>(CMD.createFile, { parent: parentDir, name: `${name}.md` });
    await get().invalidateDirs([parentDir]);
    return path;
  },

  createFolder: async (parentDir, name) => {
    const path = await ipc<string>(CMD.createDir, { parent: parentDir, name });
    await get().invalidateDirs([parentDir]);
    return path;
  },

  renameNode: async (path, dirPath, newDisplayName) => {
    const isNote = isMarkdown(path.split("/").pop() ?? "");
    const newName = isNote ? `${newDisplayName}.md` : newDisplayName;
    const newPath = await ipc<string>(CMD.renamePath, { path, newName });
    // Folder note: keep the companion folder in lockstep. Best-effort rollback
    // of the first rename if the second fails, so the pair never dessyncs.
    if (dirPath && isNote) {
      try {
        await ipc<string>(CMD.renamePath, { path: dirPath, newName: newDisplayName });
      } catch (err) {
        const oldName = path.split("/").pop()!;
        await ipc<string>(CMD.renamePath, { path: newPath, newName: oldName }).catch(() => {});
        throw err;
      }
    }
    await get().invalidateDirs([parentOf(path)]);
    return newPath;
  },

  deleteNode: async (path, dirPath) => {
    await ipc(CMD.deletePath, { path });
    if (dirPath && dirPath !== path) {
      await ipc(CMD.deletePath, { path: dirPath }).catch(() => {});
    }
    await get().invalidateDirs([parentOf(path)]);
    if (get().selectedPath === path) set({ selectedPath: null });
  },

  moveNode: async (path, dirPath, targetDir) => {
    const newPath = await ipc<string>(CMD.movePath, { path, targetDir });
    if (dirPath && dirPath !== path) {
      try {
        await ipc<string>(CMD.movePath, { path: dirPath, targetDir });
      } catch (err) {
        await ipc<string>(CMD.movePath, { path: newPath, targetDir: parentOf(path) }).catch(
          () => {},
        );
        throw err;
      }
    }
    await get().invalidateDirs([parentOf(path), targetDir]);
    return newPath;
  },
}));
