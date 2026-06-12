import { create } from "zustand";

import { CMD, ipc, errorMessage, type TextFile } from "@/lib/ipc";
import { usePageMetaStore } from "@/features/pages/pageMeta.store";
import {
  joinFrontmatter,
  splitFrontmatter,
  type NoteMeta,
} from "./markdown/frontmatter";

export type SaveStatus = "idle" | "loading" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * Open-note IO: load, debounced autosave, flush. The BlockNote instance lives
 * in the component; it registers a serializer here so blur/quit/note-switch
 * can flush without the store knowing the editor type.
 *
 * Invariants:
 * - never write on open (normalization churn would dirty agent diffs)
 * - skip the write when the serialized body is unchanged
 * - `lastSavedContent` is the exact text on disk as of our last read/write;
 *   the Fase 4 watcher uses it to tell our own echo from external edits.
 */
interface EditorState {
  path: string | null;
  status: SaveStatus;
  error: string | null;
  meta: NoteMeta;
  /** Meta changed without a body change (e.g. icon); forces the next write. */
  metaDirty: boolean;
  lastSavedBody: string | null;
  lastSavedContent: string | null;

  serializer: (() => Promise<string>) | null;
  /** Replaces the editor content with a body; registered by the component. */
  reloader: ((body: string) => Promise<void>) | null;
  saveTimer: number | null;

  load: (path: string) => Promise<string | null>;
  /** Set or clear the page icon (frontmatter `icon`) and persist right away. */
  setIcon: (icon: string | null) => void;
  registerSerializer: (fn: (() => Promise<string>) | null) => void;
  registerReloader: (fn: ((body: string) => Promise<void>) | null) => void;
  scheduleSave: () => void;
  saveNow: () => Promise<void>;
  /** Adopt `diskContent` (an external edit) as the new saved state. */
  reloadFromDisk: (path: string, diskContent: string) => Promise<void>;
  close: () => Promise<void>;
  /** Drop the open note WITHOUT flushing: its file is going away, and a
      pending autosave would resurrect it on disk. */
  discard: () => void;
  /** The open note moved on disk (rename/drag); follow without reloading. */
  remap: (path: string) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  path: null,
  status: "idle",
  error: null,
  meta: {},
  metaDirty: false,
  lastSavedBody: null,
  lastSavedContent: null,
  serializer: null,
  reloader: null,
  saveTimer: null,

  load: async (path) => {
    // Switching notes flushes the previous one first.
    await get().saveNow();
    set({ path, status: "loading", error: null, serializer: null, reloader: null });
    try {
      const file = await ipc<TextFile>(CMD.readFileText, { path });
      const { meta, body } = splitFrontmatter(file.content);
      set({
        status: "idle",
        meta,
        metaDirty: false,
        lastSavedBody: body,
        lastSavedContent: file.content,
      });
      return body;
    } catch (err) {
      set({ status: "error", error: errorMessage(err) });
      return null;
    }
  },

  setIcon: (icon) => {
    const { path, meta } = get();
    if (!path) return;
    const next: NoteMeta = { ...meta };
    if (icon) next.icon = icon;
    else delete next.icon;
    set({ meta: next, metaDirty: true });
    usePageMetaStore.getState().setIcon(path, icon);
    void get().saveNow();
  },

  registerSerializer: (fn) => set({ serializer: fn }),

  registerReloader: (fn) => set({ reloader: fn }),

  reloadFromDisk: (path, diskContent) =>
    // Joins the save queue: a flush already serializing would otherwise
    // capture a pre-reload snapshot and write it back over the disk version.
    enqueue(async () => {
      const { path: openPath, reloader, saveTimer } = get();
      if (openPath !== path || !reloader) return;
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
        set({ saveTimer: null });
      }
      const { meta, body } = splitFrontmatter(diskContent);
      await reloader(body);
      set({
        meta,
        metaDirty: false,
        lastSavedBody: body,
        lastSavedContent: diskContent,
        status: "idle",
      });
    }),

  scheduleSave: () => {
    const { saveTimer } = get();
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    const timer = window.setTimeout(() => {
      void get().saveNow();
    }, AUTOSAVE_DEBOUNCE_MS);
    set({ status: "dirty", saveTimer: timer });
  },

  // Queued, never concurrent: switching notes fires a flush from the old
  // editor's close() AND from the new editor's load(); run in parallel they
  // both pass the "body changed?" check and write twice.
  saveNow: () => enqueue(doSave),

  close: async () => {
    const closing = get().path;
    await get().saveNow();
    // While the flush was in flight a newer note may have loaded; the store
    // now belongs to it, so this close must not wipe its state.
    if (get().path !== closing) return;
    get().discard();
  },

  discard: () => {
    const { saveTimer } = get();
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    set({
      path: null,
      status: "idle",
      error: null,
      meta: {},
      metaDirty: false,
      lastSavedBody: null,
      lastSavedContent: null,
      serializer: null,
      reloader: null,
      saveTimer: null,
    });
  },

  remap: (path) => set({ path }),
}));

let saveChain: Promise<void> = Promise.resolve();

/** Serialize every disk-facing editor task; they race each other otherwise. */
function enqueue(task: () => Promise<void>): Promise<void> {
  const next = saveChain.then(task);
  saveChain = next.catch(() => {});
  return next;
}

async function doSave(): Promise<void> {
  const get = useEditorStore.getState;
  const set = useEditorStore.setState;

  const { path, serializer, saveTimer, meta, lastSavedBody } = get();
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    set({ saveTimer: null });
  }
  if (!path || !serializer) return;

  let body: string;
  try {
    body = await serializer();
  } catch {
    return; // editor mid-teardown; nothing reliable to save
  }
  // The note may have been discarded (deleted) or remapped while the
  // serializer ran; writing through the captured path would recreate it.
  if (get().path !== path) return;
  if (body === lastSavedBody && !get().metaDirty) {
    if (get().status === "dirty") set({ status: "saved" });
    return;
  }

  // Only touch `updated` when the file already carries frontmatter:
  // Paperly never introduces frontmatter into a plain markdown file.
  const hasMeta = Object.keys(meta).length > 0;
  const nextMeta: NoteMeta = hasMeta
    ? { ...meta, updated: new Date().toISOString() }
    : meta;
  const content = joinFrontmatter(nextMeta, body);

  set({ status: "saving" });
  try {
    await ipc(CMD.writeFileText, { path, content });
    set({
      status: "saved",
      meta: nextMeta,
      metaDirty: false,
      lastSavedBody: body,
      lastSavedContent: content,
    });
  } catch (err) {
    set({ status: "error", error: errorMessage(err) });
  }
}

/** Flush on window blur and before quit. Call once at startup. */
export function initEditorFlushListeners() {
  window.addEventListener("blur", () => {
    void useEditorStore.getState().saveNow();
  });
  window.addEventListener("beforeunload", () => {
    void useEditorStore.getState().saveNow();
  });
}
