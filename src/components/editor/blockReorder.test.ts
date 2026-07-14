// @vitest-environment happy-dom
import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";

import { reorderBlock, resolveVerticalDropTarget } from "./blockReorder";

function makeEditor(): BlockNoteEditor {
  const options = {
    _headless: true,
    initialContent: [
      { id: "intro", type: "paragraph", content: "Intro" },
      {
        id: "section",
        type: "paragraph",
        content: "Section",
        children: [{ id: "detail", type: "paragraph", content: "Detail" }],
      },
      { id: "photo", type: "image", props: { url: "assets/photo.png" } },
      { id: "end", type: "paragraph", content: "End" },
    ],
  } as unknown as Parameters<typeof BlockNoteEditor.create>[0];

  return BlockNoteEditor.create(options);
}

describe("editor block reordering", () => {
  it("resolves a drop target by row height without requiring a horizontal hit", () => {
    const target = resolveVerticalDropTarget(
      [
        { id: "intro", top: 100, bottom: 130 },
        { id: "section", top: 140, bottom: 170 },
      ],
      150,
    );

    expect(target).toEqual({ id: "section", placement: "before" });
  });

  it("moves a regular block to the requested document position", () => {
    const editor = makeEditor();

    expect(reorderBlock(editor, "intro", "photo", "after")).toBe(true);
    expect(editor.document.map((block) => block.id)).toEqual([
      "section",
      "photo",
      "intro",
      "end",
    ]);
  });

  it("moves a component block without losing its content", () => {
    const editor = makeEditor();

    expect(reorderBlock(editor, "photo", "intro", "before")).toBe(true);
    expect(editor.document.map((block) => block.id)).toEqual([
      "photo",
      "intro",
      "section",
      "end",
    ]);
    const photo = editor.getBlock("photo");
    expect(photo?.type).toBe("image");
    if (photo?.type !== "image") throw new Error("Expected an image block");
    expect(photo.props.url).toBe("assets/photo.png");
    expect(editor.getTextCursorPosition().block.id).toBe("photo");
  });

  it("keeps nested children when their parent block moves", () => {
    const editor = makeEditor();

    expect(reorderBlock(editor, "section", "end", "after")).toBe(true);
    expect(editor.document.map((block) => block.id)).toEqual([
      "intro",
      "photo",
      "end",
      "section",
    ]);
    expect(editor.getBlock("section")?.children.map((block) => block.id)).toEqual(["detail"]);
  });

  it("rejects a drop inside the dragged block subtree", () => {
    const editor = makeEditor();
    const before = editor.document;

    expect(reorderBlock(editor, "section", "detail", "before")).toBe(false);
    expect(editor.document).toEqual(before);
  });

  it("moves a multi-block selection as one ordered group", () => {
    const editor = makeEditor();
    editor.setSelection("intro", "section");

    expect(reorderBlock(editor, "intro", "end", "after")).toBe(true);
    expect(editor.document.map((block) => block.id)).toEqual([
      "photo",
      "end",
      "intro",
      "section",
    ]);
    expect(editor.getSelection()?.blocks.map((block) => block.id)).toEqual([
      "intro",
      "section",
    ]);
  });

  it("keeps the text cursor with a single moved block", () => {
    const editor = makeEditor();
    editor.setTextCursorPosition("intro", "start");

    expect(reorderBlock(editor, "intro", "end", "after")).toBe(true);
    expect(editor.getTextCursorPosition().block.id).toBe("intro");
  });
});
