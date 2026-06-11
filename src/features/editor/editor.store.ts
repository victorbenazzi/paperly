import { create } from "zustand";

import { CMD, ipc, errorMessage, type TextFile } from "@/lib/ipc";
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
  lastSavedBody: string | null;
  lastSavedContent: string | null;

  serializer: (() => Promise<string>) | null;
  saveTimer: number | null;

  load: (path: string) => Promise<string | null>;
  registerSerializer: (fn: (() => Promise<string>) | null) => void;
  scheduleSave: () => void;
  saveNow: () => Promise<void>;
  close: () => Promise<void>;
  /** The open note moved on disk (rename/drag); follow without reloading. */
  remap: (path: string) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  path: null,
  status: "idle",
  error: null,
  meta: {},
  lastSavedBody: null,
  lastSavedContent: null,
  serializer: null,
  saveTimer: null,

  load: async (path) => {
    // Switching notes flushes the previous one first.
    await get().saveNow();
    set({ path, status: "loading", error: null, serializer: null });
    try {
      const file = await ipc<TextFile>(CMD.readFileText, { path });
      const { meta, body } = splitFrontmatter(file.content);
      set({
        status: "idle",
        meta,
        lastSavedBody: body,
        lastSavedContent: file.content,
      });
      return body;
    } catch (err) {
      set({ status: "error", error: errorMessage(err) });
      return null;
    }
  },

  registerSerializer: (fn) => set({ serializer: fn }),

  scheduleSave: () => {
    const { saveTimer } = get();
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    const timer = window.setTimeout(() => {
      void get().saveNow();
    }, AUTOSAVE_DEBOUNCE_MS);
    set({ status: "dirty", saveTimer: timer });
  },

  saveNow: async () => {
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
    if (body === lastSavedBody) {
      if (get().status === "dirty") set({ status: "saved" });
      return;
    }

    // Only touch `updated` when the file already carries frontmatter:
    // noteflow never introduces frontmatter into a plain markdown file.
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
        lastSavedBody: body,
        lastSavedContent: content,
      });
    } catch (err) {
      set({ status: "error", error: errorMessage(err) });
    }
  },

  close: async () => {
    await get().saveNow();
    set({
      path: null,
      status: "idle",
      error: null,
      meta: {},
      lastSavedBody: null,
      lastSavedContent: null,
      serializer: null,
    });
  },

  remap: (path) => set({ path }),
}));

/** Flush on window blur and before quit. Call once at startup. */
export function initEditorFlushListeners() {
  window.addEventListener("blur", () => {
    void useEditorStore.getState().saveNow();
  });
  window.addEventListener("beforeunload", () => {
    void useEditorStore.getState().saveNow();
  });
}
