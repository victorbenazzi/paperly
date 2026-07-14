import { create } from "zustand";

import { CMD, ipc, errorMessage, type TextFile } from "@/lib/ipc";
import { usePageMetaStore } from "@/features/pages/pageMeta.store";
import i18n from "@/features/i18n/config";
import { joinFrontmatter, splitFrontmatter, type NoteMeta } from "./markdown/frontmatter";

export type SaveStatus =
  | "idle"
  | "loading"
  | "ready"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "readOnly";

export type SaveFailureReason = "serialize" | "write" | "staleSession" | "readOnly";

export type SaveResult =
  | { ok: true; wrote: boolean }
  | { ok: false; reason: SaveFailureReason; message: string };

export type LoadResult =
  | {
      ok: true;
      sessionId: number;
      path: string;
      body: string;
      mode: "editable" | "readOnly";
    }
  | {
      ok: false;
      reason: "read" | "saveFailed" | "staleSession";
      message: string;
    };

export interface ReadOnlyInfo {
  reason: "truncated" | "encoding";
  encoding: string;
  size: number;
}

const AUTOSAVE_DEBOUNCE_MS = 800;
const editorMessage = (key: string) => i18n.t(`editor.errors.${key}`);
const staleSessionMessage = () => editorMessage("staleSession");

export interface DocumentSession {
  sessionId: number;
  path: string | null;
  status: SaveStatus;
  error: string | null;
  readOnlyInfo: ReadOnlyInfo | null;
  meta: NoteMeta;
  metaDirty: boolean;
  lastSavedBody: string | null;
  lastSavedContent: string | null;
  revision: number;

  serializer: (() => Promise<string>) | null;
  reloader: ((body: string) => Promise<void>) | null;
  saveTimer: number | null;
}

/**
 * One state machine owns the open document and every disk-facing transition.
 * Component callbacks are registered against a session id, so an editor that
 * is unmounting can never mutate or save the editor that replaced it.
 */
interface EditorState extends DocumentSession {
  load: (path: string) => Promise<LoadResult>;
  setIcon: (icon: string | null) => void;
  registerSerializer: (sessionId: number, fn: (() => Promise<string>) | null) => void;
  registerReloader: (
    sessionId: number,
    fn: ((body: string) => Promise<void>) | null,
  ) => void;
  scheduleSave: (sessionId?: number) => void;
  saveNow: (sessionId?: number) => Promise<SaveResult>;
  forceSave: (sessionId?: number) => Promise<SaveResult>;
  reloadFromDisk: (path: string, diskContent: string) => Promise<SaveResult>;
  close: (sessionId: number) => Promise<SaveResult>;
  discard: (sessionId?: number) => void;
  remap: (path: string) => void;
}

let nextSessionId = 0;

export const useEditorStore = create<EditorState>((set, get) => ({
  sessionId: 0,
  path: null,
  status: "idle",
  error: null,
  readOnlyInfo: null,
  meta: {},
  metaDirty: false,
  lastSavedBody: null,
  lastSavedContent: null,
  revision: 0,
  serializer: null,
  reloader: null,
  saveTimer: null,

  load: async (path) => {
    const previous = get();
    if (previous.path) {
      const flushed = await get().saveNow(previous.sessionId);
      if (!flushed.ok && flushed.reason !== "staleSession" && flushed.reason !== "readOnly") {
        return { ok: false, reason: "saveFailed", message: flushed.message };
      }
    }

    const sessionId = ++nextSessionId;
    set({
      sessionId,
      path,
      status: "loading",
      error: null,
      readOnlyInfo: null,
      meta: {},
      metaDirty: false,
      lastSavedBody: null,
      lastSavedContent: null,
      revision: 0,
      serializer: null,
      reloader: null,
      saveTimer: null,
    });

    try {
      const file = await ipc<TextFile>(CMD.readFileText, { path });
      const current = get();
      if (current.sessionId !== sessionId || current.path !== path) {
        return { ok: false, reason: "staleSession", message: staleSessionMessage() };
      }

      const { meta, body } = splitFrontmatter(file.content);
      const readOnlyInfo: ReadOnlyInfo | null = file.truncated
        ? { reason: "truncated", encoding: file.encoding, size: file.size }
        : file.encoding.toLowerCase() !== "utf-8"
          ? { reason: "encoding", encoding: file.encoding, size: file.size }
          : null;
      set({
        status: readOnlyInfo ? "readOnly" : "ready",
        error: null,
        readOnlyInfo,
        meta,
        metaDirty: false,
        lastSavedBody: body,
        lastSavedContent: file.content,
      });
      return {
        ok: true,
        sessionId,
        path,
        body,
        mode: readOnlyInfo ? "readOnly" : "editable",
      };
    } catch (err) {
      const message = errorMessage(err);
      if (get().sessionId !== sessionId || get().path !== path) {
        return { ok: false, reason: "staleSession", message: staleSessionMessage() };
      }
      set({ status: "error", error: message });
      return { ok: false, reason: "read", message };
    }
  },

  setIcon: (icon) => {
    const { path, meta, sessionId, status } = get();
    if (!path || status === "readOnly") return;
    const next: NoteMeta = { ...meta };
    if (icon) next.icon = icon;
    else delete next.icon;
    set((state) => ({
      meta: next,
      metaDirty: true,
      status: "dirty",
      revision: state.revision + 1,
    }));
    usePageMetaStore.getState().setIcon(path, icon);
    void get().saveNow(sessionId);
  },

  registerSerializer: (sessionId, fn) => {
    if (get().sessionId === sessionId) set({ serializer: fn });
  },

  registerReloader: (sessionId, fn) => {
    if (get().sessionId === sessionId) set({ reloader: fn });
  },

  reloadFromDisk: (path, diskContent) => {
    const sessionId = get().sessionId;
    return enqueue(async () => {
      const { path: openPath, reloader, saveTimer } = get();
      if (get().sessionId !== sessionId || openPath !== path) {
        return { ok: false, reason: "staleSession", message: staleSessionMessage() };
      }
      if (!reloader) {
        return { ok: false, reason: "serialize", message: editorMessage("notReady") };
      }
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      try {
        const { meta, body } = splitFrontmatter(diskContent);
        await reloader(body);
        if (get().sessionId !== sessionId || get().path !== path) {
          return { ok: false, reason: "staleSession", message: staleSessionMessage() };
        }
        set({
          meta,
          metaDirty: false,
          lastSavedBody: body,
          lastSavedContent: diskContent,
          status: "ready",
          error: null,
          saveTimer: null,
        });
        return { ok: true, wrote: false };
      } catch (err) {
        const message = errorMessage(err);
        if (get().sessionId === sessionId) set({ status: "error", error: message });
        return { ok: false, reason: "serialize", message };
      }
    });
  },

  scheduleSave: (requestedSessionId) => {
    const current = get();
    const sessionId = requestedSessionId ?? current.sessionId;
    if (current.sessionId !== sessionId || current.status === "readOnly") return;
    if (current.saveTimer !== null) window.clearTimeout(current.saveTimer);
    const timer = window.setTimeout(() => {
      void get().saveNow(sessionId);
    }, AUTOSAVE_DEBOUNCE_MS);
    set((state) => ({
      status: "dirty",
      error: null,
      saveTimer: timer,
      revision: state.revision + 1,
    }));
  },

  saveNow: (requestedSessionId) => {
    const sessionId = requestedSessionId ?? get().sessionId;
    return enqueue(() => doSave(sessionId));
  },

  forceSave: (requestedSessionId) => {
    const sessionId = requestedSessionId ?? get().sessionId;
    if (get().sessionId !== sessionId) {
      return Promise.resolve({
        ok: false,
        reason: "staleSession",
        message: staleSessionMessage(),
      });
    }
    if (get().status !== "readOnly") {
      set((state) => ({
        metaDirty: true,
        status: "dirty",
        revision: state.revision + 1,
      }));
    }
    return get().saveNow(sessionId);
  },

  close: async (sessionId) => {
    const saved = await get().saveNow(sessionId);
    if (saved.ok && get().sessionId === sessionId) get().discard(sessionId);
    return saved;
  },

  discard: (sessionId) => {
    if (sessionId !== undefined && get().sessionId !== sessionId) return;
    const { saveTimer } = get();
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    set({
      path: null,
      status: "idle",
      error: null,
      readOnlyInfo: null,
      meta: {},
      metaDirty: false,
      lastSavedBody: null,
      lastSavedContent: null,
      revision: 0,
      serializer: null,
      reloader: null,
      saveTimer: null,
    });
  },

  remap: (path) => set({ path }),
}));

let saveChain: Promise<SaveResult> = Promise.resolve({ ok: true, wrote: false });

function enqueue(task: () => Promise<SaveResult>): Promise<SaveResult> {
  const next = saveChain.then(task, task);
  saveChain = next;
  return next;
}

async function doSave(sessionId: number): Promise<SaveResult> {
  const get = useEditorStore.getState;
  const set = useEditorStore.setState;
  const current = get();
  if (current.sessionId !== sessionId) {
    return { ok: false, reason: "staleSession", message: staleSessionMessage() };
  }
  if (current.status === "readOnly") {
    return { ok: false, reason: "readOnly", message: editorMessage("readOnly") };
  }

  const { path, serializer, saveTimer, meta, lastSavedBody, revision } = current;
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    set({ saveTimer: null });
  }
  if (!path) return { ok: true, wrote: false };
  if (!serializer) {
    if (
      current.status === "loading" ||
      current.status === "ready" ||
      (current.lastSavedContent === null && !current.metaDirty)
    ) {
      return { ok: true, wrote: false };
    }
    const message = editorMessage("notReadyToSave");
    set({ status: "error", error: message });
    return { ok: false, reason: "serialize", message };
  }

  let body: string;
  try {
    body = await serializer();
  } catch (err) {
    const message = errorMessage(err);
    if (get().sessionId === sessionId) set({ status: "error", error: message });
    return { ok: false, reason: "serialize", message };
  }
  if (get().sessionId !== sessionId || get().path !== path) {
    return { ok: false, reason: "staleSession", message: staleSessionMessage() };
  }
  if (body === lastSavedBody && !get().metaDirty) {
    if (get().revision === revision && get().status === "dirty") {
      set({ status: "saved", error: null });
    }
    return { ok: true, wrote: false };
  }

  const hasMeta = Object.keys(meta).length > 0;
  const nextMeta: NoteMeta = hasMeta ? { ...meta, updated: new Date().toISOString() } : meta;
  const content = joinFrontmatter(nextMeta, body);

  set({ status: "saving", error: null });
  try {
    await ipc(CMD.writeFileText, { path, content });
    if (get().sessionId !== sessionId || get().path !== path) {
      return { ok: false, reason: "staleSession", message: staleSessionMessage() };
    }
    const latest = get();
    const hasNewerChanges = latest.revision !== revision;
    set({
      status: hasNewerChanges ? "dirty" : "saved",
      error: null,
      meta: hasNewerChanges ? latest.meta : nextMeta,
      metaDirty: hasNewerChanges ? latest.metaDirty : false,
      lastSavedBody: body,
      lastSavedContent: content,
    });
    return { ok: true, wrote: true };
  } catch (err) {
    const message = errorMessage(err);
    if (get().sessionId === sessionId) set({ status: "error", error: message });
    return { ok: false, reason: "write", message };
  }
}

/** Best-effort blur flush. Native quit uses the explicit close handshake. */
export function initEditorFlushListeners() {
  window.addEventListener("blur", () => {
    void useEditorStore.getState().saveNow();
  });
}
