// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TextFile } from "@/lib/ipc";

const { ipcMock } = vi.hoisted(() => ({ ipcMock: vi.fn() }));

vi.mock("@/lib/ipc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ipc")>()),
  ipc: ipcMock,
}));

import { useEditorStore } from "@/features/editor/editor.store";
import { useNavStore } from "./nav.store";

function textFile(content: string): TextFile {
  return { content, encoding: "utf-8", truncated: false, size: content.length };
}

describe("guarded note navigation", () => {
  beforeEach(() => {
    ipcMock.mockReset();
    useEditorStore.getState().discard();
    useNavStore.setState({
      openPath: null,
      back: [],
      forward: [],
      focusRequest: null,
    });
  });

  it("does not leave the current note when its flush fails", async () => {
    ipcMock
      .mockResolvedValueOnce(textFile("Before"))
      .mockRejectedValueOnce({ code: "Io", message: "disk full" });
    const loaded = await useEditorStore.getState().load("/vault/A.md");
    if (!loaded.ok) throw new Error("expected the note to load");
    useEditorStore.getState().registerSerializer(loaded.sessionId, async () => "After");
    useEditorStore.getState().scheduleSave(loaded.sessionId);
    useNavStore.setState({ openPath: "/vault/A.md" });

    expect(await useNavStore.getState().open("/vault/B.md")).toBe(false);
    expect(useNavStore.getState().openPath).toBe("/vault/A.md");
    expect(useEditorStore.getState()).toMatchObject({
      path: "/vault/A.md",
      status: "error",
      lastSavedBody: "Before",
    });
  });

  it("navigates after a retry writes the local version", async () => {
    ipcMock
      .mockResolvedValueOnce(textFile("Before"))
      .mockRejectedValueOnce({ code: "Io", message: "disk full" })
      .mockResolvedValueOnce(null);
    const loaded = await useEditorStore.getState().load("/vault/A.md");
    if (!loaded.ok) throw new Error("expected the note to load");
    useEditorStore.getState().registerSerializer(loaded.sessionId, async () => "After");
    useEditorStore.getState().scheduleSave(loaded.sessionId);
    useNavStore.setState({ openPath: "/vault/A.md" });

    expect(await useNavStore.getState().open("/vault/B.md")).toBe(false);
    expect(await useNavStore.getState().open("/vault/B.md")).toBe(true);
    expect(useNavStore.getState()).toMatchObject({
      openPath: "/vault/B.md",
      back: ["/vault/A.md"],
    });
    expect(useEditorStore.getState().lastSavedBody).toBe("After");
  });
});
