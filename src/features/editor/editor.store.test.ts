// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TextFile } from "@/lib/ipc";

const { ipcMock } = vi.hoisted(() => ({ ipcMock: vi.fn() }));

vi.mock("@/lib/ipc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ipc")>()),
  ipc: ipcMock,
}));

import { useEditorStore, type LoadResult } from "./editor.store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function textFile(content: string, overrides: Partial<TextFile> = {}): TextFile {
  return {
    content,
    encoding: "utf-8",
    truncated: false,
    size: content.length,
    ...overrides,
  };
}

describe("document session", () => {
  beforeEach(() => {
    ipcMock.mockReset();
    useEditorStore.getState().discard();
  });

  it("keeps the newest note when an older read finishes last", async () => {
    const first = deferred<TextFile>();
    const second = deferred<TextFile>();
    ipcMock.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);

    const firstLoad = useEditorStore.getState().load("/vault/First.md");
    await Promise.resolve();
    const secondLoad = useEditorStore.getState().load("/vault/Second.md");
    await Promise.resolve();

    second.resolve(textFile("Second body"));
    const secondResult = await secondLoad;
    first.resolve(textFile("First body"));
    const firstResult = await firstLoad;

    expect(secondResult).toMatchObject({ ok: true, path: "/vault/Second.md" });
    expect(firstResult).toMatchObject({ ok: false, reason: "staleSession" });
    expect(useEditorStore.getState()).toMatchObject({
      path: "/vault/Second.md",
      lastSavedBody: "Second body",
      lastSavedContent: "Second body",
    });
  });

  it("survives 500 rapid note switches without crossing session state", async () => {
    const reads = Array.from({ length: 500 }, () => deferred<TextFile>());
    let nextRead = 0;
    ipcMock.mockImplementation(() => reads[nextRead++]!.promise);
    const pending: Array<Promise<LoadResult>> = [];

    for (let index = 0; index < 500; index += 1) {
      pending.push(useEditorStore.getState().load(`/vault/Note-${index}.md`));
      while (ipcMock.mock.calls.length < index + 1) await Promise.resolve();
    }

    for (let index = reads.length - 1; index >= 0; index -= 1) {
      reads[index]!.resolve(textFile(`Body ${index}`));
    }
    const results = await Promise.all(pending);

    expect(results[results.length - 1]).toMatchObject({ ok: true, path: "/vault/Note-499.md" });
    expect(results.slice(0, -1).every((result) => !result.ok && result.reason === "staleSession"))
      .toBe(true);
    expect(useEditorStore.getState()).toMatchObject({
      path: "/vault/Note-499.md",
      lastSavedBody: "Body 499",
    });
  });

  it("opens a truncated file as read only and never writes it", async () => {
    ipcMock.mockResolvedValueOnce(textFile("partial", { truncated: true, size: 30_000_000 }));

    const loaded = await useEditorStore.getState().load("/vault/Large.md");
    expect(loaded).toMatchObject({ ok: true, mode: "readOnly" });
    expect(useEditorStore.getState().status).toBe("readOnly");

    const saved = await useEditorStore.getState().saveNow();
    expect(saved).toMatchObject({ ok: false, reason: "readOnly" });
    expect(ipcMock).toHaveBeenCalledTimes(1);
  });

  it("opens invalid UTF-8 as read only and never writes it", async () => {
    ipcMock.mockResolvedValueOnce(textFile("replacement characters", { encoding: "lossy" }));

    const loaded = await useEditorStore.getState().load("/vault/Invalid.md");
    expect(loaded).toMatchObject({ ok: true, mode: "readOnly" });
    expect(await useEditorStore.getState().forceSave()).toMatchObject({
      ok: false,
      reason: "readOnly",
    });
    expect(ipcMock).toHaveBeenCalledTimes(1);
  });

  it("does not write when serialization fails", async () => {
    ipcMock.mockResolvedValueOnce(textFile("Before"));
    const loaded = await useEditorStore.getState().load("/vault/Note.md");
    if (!loaded.ok) throw new Error("expected the note to load");
    useEditorStore.getState().registerSerializer(loaded.sessionId, async () => {
      throw new Error("preserved block missing");
    });
    useEditorStore.getState().scheduleSave(loaded.sessionId);

    expect(await useEditorStore.getState().saveNow(loaded.sessionId)).toEqual({
      ok: false,
      reason: "serialize",
      message: "preserved block missing",
    });
    expect(ipcMock).toHaveBeenCalledTimes(1);
  });

  it("returns a write failure and keeps the session in an error state", async () => {
    ipcMock
      .mockResolvedValueOnce(textFile("Before"))
      .mockRejectedValueOnce({ code: "Io", message: "disk full" });

    const loaded = await useEditorStore.getState().load("/vault/Note.md");
    if (!loaded.ok) throw new Error("expected the note to load");
    useEditorStore.getState().registerSerializer(loaded.sessionId, async () => "After");
    useEditorStore.getState().scheduleSave(loaded.sessionId);

    const saved = await useEditorStore.getState().saveNow(loaded.sessionId);
    expect(saved).toEqual({ ok: false, reason: "write", message: "disk full" });
    expect(useEditorStore.getState()).toMatchObject({ status: "error", error: "disk full" });
  });

  it("retries a failed write without discarding local content", async () => {
    ipcMock
      .mockResolvedValueOnce(textFile("Before"))
      .mockRejectedValueOnce({ code: "Io", message: "disk full" })
      .mockResolvedValueOnce(null);

    const loaded = await useEditorStore.getState().load("/vault/Retry.md");
    if (!loaded.ok) throw new Error("expected the note to load");
    useEditorStore.getState().registerSerializer(loaded.sessionId, async () => "After");
    useEditorStore.getState().scheduleSave(loaded.sessionId);

    expect(await useEditorStore.getState().saveNow(loaded.sessionId)).toMatchObject({ ok: false });
    expect(await useEditorStore.getState().saveNow(loaded.sessionId)).toEqual({
      ok: true,
      wrote: true,
    });
    expect(useEditorStore.getState()).toMatchObject({
      status: "saved",
      lastSavedBody: "After",
    });
  });

  it("persists metadata changed while an older write is in flight", async () => {
    const firstWrite = deferred<unknown>();
    ipcMock.mockResolvedValueOnce(textFile("Before")).mockImplementationOnce(
      () => firstWrite.promise,
    );

    const loaded = await useEditorStore.getState().load("/vault/Metadata.md");
    if (!loaded.ok) throw new Error("expected the note to load");
    useEditorStore.getState().registerSerializer(loaded.sessionId, async () => "After");
    useEditorStore.getState().scheduleSave(loaded.sessionId);

    const firstSave = useEditorStore.getState().saveNow(loaded.sessionId);
    while (ipcMock.mock.calls.length < 2) await Promise.resolve();
    useEditorStore.getState().setIcon("📘");
    ipcMock.mockResolvedValueOnce(null);
    firstWrite.resolve(null);

    expect(await firstSave).toEqual({ ok: true, wrote: true });
    await useEditorStore.getState().saveNow(loaded.sessionId);

    expect(ipcMock).toHaveBeenCalledTimes(3);
    expect(ipcMock.mock.calls[2]?.[1]).toMatchObject({ content: expect.stringContaining("📘") });
    expect(useEditorStore.getState()).toMatchObject({
      status: "saved",
      meta: { icon: "📘", updated: expect.any(String) },
    });
  });

  it("keeps the disk conflict visible when reload fails", async () => {
    ipcMock.mockResolvedValueOnce(textFile("Local"));
    const loaded = await useEditorStore.getState().load("/vault/Conflict.md");
    if (!loaded.ok) throw new Error("expected the note to load");
    useEditorStore.getState().registerReloader(loaded.sessionId, async () => {
      throw new Error("invalid external content");
    });

    expect(
      await useEditorStore.getState().reloadFromDisk("/vault/Conflict.md", "External"),
    ).toEqual({
      ok: false,
      reason: "serialize",
      message: "invalid external content",
    });
    expect(useEditorStore.getState()).toMatchObject({
      status: "error",
      lastSavedContent: "Local",
      error: "invalid external content",
    });
  });
});
