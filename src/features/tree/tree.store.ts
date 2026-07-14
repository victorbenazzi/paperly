import { create } from "zustand";

import {
  CMD,
  ipc,
  type DeletePageOutcome,
  type DirEntry,
  type PagePaths,
} from "@/lib/ipc";
import { isMarkdown, stripMdExt } from "./tree.types";

/**
 * Flat directory cache keyed by absolute dir path, loaded lazily on expand.
 * No nested tree in memory: invalidation is "drop the dir, re-list if visible".
 */
interface TreeState {
  dirCache: Record<string, DirEntry[]>;
  expanded: Set<string>;
  /** True once the user toggled any folder this session; the persisted
      expansion set must not override what they just did. */
  expandedTouched: boolean;
  selectedPath: string | null;
  /** Inline editor state: a node being renamed, or a new item being named. */
  renamingPath: string | null;
  /**
   * Manual sibling order per dir: display names, written by drag-reorder.
   * UI state only (persisted in the vault's workspace file), never touches
   * the markdown on disk. Names not listed sort after the ordered block.
   */
  order: Record<string, string[]>;

  loadDir: (dirPath: string) => Promise<void>;
  toggleExpanded: (dirPath: string) => void;
  setExpanded: (dirs: string[]) => void;
  select: (path: string | null) => void;
  startRename: (path: string | null) => void;
  /** Replace one dir's manual order (drag-reorder drop). */
  setOrder: (dirPath: string, names: string[]) => void;
  /** Bulk restore from the persisted workspace state. */
  setOrderMap: (order: Record<string, string[]>) => void;
  /** Drop cached listings for these dirs and re-list the ones still loaded. */
  invalidateDirs: (dirPaths: string[]) => Promise<void>;
  /**
   * React to watcher events. FSEvents coalesces bursts into dir-level events,
   * so each changed path refreshes its parent dir, itself (when it is a loaded
   * dir) and every loaded dir underneath it.
   */
  handleFsChange: (paths: string[]) => void;
  /** The vault root folder moved on disk (vault rename): re-key every state
      entry holding absolute paths. The dir cache is dropped instead of
      remapped; rendering reloads it lazily under the new root. */
  remapRoot: (from: string, to: string) => void;
  reset: () => void;

  createNote: (parentDir: string, baseName: string) => Promise<string>;
  createFolder: (parentDir: string, name: string) => Promise<string>;
  /** Rename a page through the backend page command so `X.md` and `X/` stay together. */
  renameNode: (
    path: string,
    dirPath: string | null,
    newDisplayName: string,
  ) => Promise<string>;
  deleteNode: (path: string, dirPath: string | null) => Promise<DeletePageOutcome>;
  moveNode: (path: string, dirPath: string | null, targetDir: string) => Promise<string>;
}

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

async function listDir(dirPath: string): Promise<DirEntry[]> {
  return ipc<DirEntry[]>(CMD.readDir, { path: dirPath });
}

/** Swap a name inside one dir's order list, keeping its slot. */
function renameInOrder(
  order: Record<string, string[]>,
  dirPath: string,
  oldName: string,
  newName: string,
): Record<string, string[]> {
  const names = order[dirPath];
  if (!names?.includes(oldName)) return order;
  return { ...order, [dirPath]: names.map((n) => (n === oldName ? newName : n)) };
}

/** Remove a name from one dir's order list. */
function dropFromOrder(
  order: Record<string, string[]>,
  dirPath: string,
  name: string,
): Record<string, string[]> {
  const names = order[dirPath];
  if (!names?.includes(name)) return order;
  return { ...order, [dirPath]: names.filter((n) => n !== name) };
}

/**
 * Order entries are keyed by absolute dir path, so a dir that renames, moves
 * or dies must carry (or drop) every entry under it; otherwise the workspace
 * file accumulates dead keys forever. `toDir: null` deletes the subtree.
 */
function remapOrderDirs(
  order: Record<string, string[]>,
  fromDir: string,
  toDir: string | null,
): Record<string, string[]> {
  let changed = false;
  const next: Record<string, string[]> = {};
  for (const [dir, names] of Object.entries(order)) {
    if (dir !== fromDir && !dir.startsWith(`${fromDir}/`)) {
      next[dir] = names;
      continue;
    }
    changed = true;
    if (toDir !== null) next[toDir + dir.slice(fromDir.length)] = names;
  }
  return changed ? next : order;
}

/** Tree display name of an entry: notes lose the extension. */
function displayNameOf(path: string): string {
  const base = path.split("/").pop()!;
  return isMarkdown(base) ? stripMdExt(base) : base;
}

export const useTreeStore = create<TreeState>((set, get) => ({
  dirCache: {},
  expanded: new Set<string>(),
  expandedTouched: false,
  selectedPath: null,
  renamingPath: null,
  order: {},

  loadDir: async (dirPath) => {
    const entries = await listDir(dirPath);
    set((s) => ({ dirCache: { ...s.dirCache, [dirPath]: entries } }));
  },

  toggleExpanded: (dirPath) => {
    set((s) => {
      const expanded = new Set(s.expanded);
      if (expanded.has(dirPath)) expanded.delete(dirPath);
      else expanded.add(dirPath);
      return { expanded, expandedTouched: true };
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

  setOrder: (dirPath, names) =>
    set((s) => ({ order: { ...s.order, [dirPath]: names } })),
  setOrderMap: (order) => set({ order: order ?? {} }),

  invalidateDirs: async (dirPaths) => {
    const { dirCache } = get();
    const toReload = dirPaths.filter((d) => dirCache[d] !== undefined);
    await Promise.all(toReload.map((d) => get().loadDir(d)));
  },

  handleFsChange: (paths) => {
    const loaded = Object.keys(get().dirCache);
    const toReload = new Set<string>();
    for (const p of paths) {
      const parent = parentOf(p);
      for (const dir of loaded) {
        if (dir === parent || dir === p || dir.startsWith(`${p}/`)) toReload.add(dir);
      }
    }
    if (toReload.size > 0) void get().invalidateDirs([...toReload]);
  },

  remapRoot: (from, to) => {
    const remap = (p: string) =>
      p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p;
    set((s) => ({
      dirCache: {},
      expanded: new Set([...s.expanded].map(remap)),
      selectedPath: s.selectedPath ? remap(s.selectedPath) : null,
      renamingPath: null,
      order: remapOrderDirs(s.order, from, to),
    }));
  },

  reset: () =>
    set({
      dirCache: {},
      expanded: new Set(),
      expandedTouched: false,
      selectedPath: null,
      renamingPath: null,
      order: {},
    }),

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

  createFolder: async (parentDir, baseName) => {
    const entries = get().dirCache[parentDir] ?? (await listDir(parentDir));
    const taken = new Set(entries.filter((e) => e.isDir).map((e) => e.name.toLowerCase()));
    let name = baseName;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${baseName} ${n}`;
    const path = await ipc<string>(CMD.createDir, { parent: parentDir, name });
    await get().invalidateDirs([parentDir]);
    return path;
  },

  renameNode: async (path, dirPath, newDisplayName) => {
    const isNote = isMarkdown(path.split("/").pop() ?? "");
    const newName = isNote ? `${newDisplayName}.md` : newDisplayName;
    const page =
      isNote
        ? await ipc<PagePaths>(CMD.renamePage, { path, dirPath, newDisplayName })
        : { path: await ipc<string>(CMD.renamePath, { path, newName }), dirPath: null };
    const newPath = page.path;
    set((s) => {
      let order = renameInOrder(s.order, parentOf(path), displayNameOf(path), newDisplayName);
      const oldDir = isNote ? dirPath : path;
      const newDir = isNote ? page.dirPath : newPath;
      if (oldDir && newDir) order = remapOrderDirs(order, oldDir, newDir);
      return { order };
    });
    await get().invalidateDirs([parentOf(path)]);
    return newPath;
  },

  deleteNode: async (path, dirPath) => {
    const isNote = isMarkdown(path.split("/").pop() ?? "");
    const outcome = isNote
      ? await ipc<DeletePageOutcome>(CMD.deletePage, { path, dirPath })
      : await ipc(CMD.deletePath, { path }).then(
          () => ({ kind: "deleted", deletedPaths: [path] }) as DeletePageOutcome,
        );
    const deletedPaths = outcome.kind === "failed" ? [] : outcome.deletedPaths;
    if (deletedPaths.length === 0) return outcome;
    set((s) => {
      let order = dropFromOrder(s.order, parentOf(path), displayNameOf(path));
      if (dirPath && deletedPaths.includes(dirPath)) order = remapOrderDirs(order, dirPath, null);
      return { order };
    });
    await get().invalidateDirs([parentOf(path)]);
    if (deletedPaths.includes(path) && get().selectedPath === path) set({ selectedPath: null });
    return outcome;
  },

  moveNode: async (path, dirPath, targetDir) => {
    const isNote = isMarkdown(path.split("/").pop() ?? "");
    const page =
      isNote
        ? await ipc<PagePaths>(CMD.movePage, { path, dirPath, targetDir })
        : { path: await ipc<string>(CMD.movePath, { path, targetDir }), dirPath: null };
    const newPath = page.path;
    set((s) => {
      let order = dropFromOrder(s.order, parentOf(path), displayNameOf(path));
      if (dirPath && page.dirPath) order = remapOrderDirs(order, dirPath, page.dirPath);
      return { order };
    });
    await get().invalidateDirs([parentOf(path), targetDir]);
    return newPath;
  },
}));
