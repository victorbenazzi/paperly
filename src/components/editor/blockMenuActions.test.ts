// @vitest-environment happy-dom
import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";

import {
  canTurnMenuBlocksInto,
  duplicateMenuBlocks,
  removeMenuBlocks,
  turnMenuBlocksInto,
} from "./blockMenuActions";

function makeEditor(): BlockNoteEditor {
  const options = {
    _headless: true,
    initialContent: [
      { id: "intro", type: "paragraph", content: "Intro" },
      {
        id: "section",
        type: "heading",
        props: { level: 2 },
        content: "Section",
        children: [{ id: "detail", type: "paragraph", content: "Detail" }],
      },
      { id: "photo", type: "image", props: { url: "assets/photo.png" } },
      { id: "end", type: "paragraph", content: "End" },
    ],
  } as unknown as Parameters<typeof BlockNoteEditor.create>[0];

  return BlockNoteEditor.create(options);
}

describe("editor block menu actions", () => {
  it("duplicates a component with a fresh id and intact props", () => {
    const editor = makeEditor();
    const photo = editor.getBlock("photo")!;

    const [duplicate] = duplicateMenuBlocks(editor, photo);

    expect(duplicate?.id).not.toBe(photo.id);
    expect(duplicate?.type).toBe("image");
    expect(duplicate?.props.url).toBe("assets/photo.png");
    expect(editor.document.map((block) => block.id)).toEqual([
      "intro",
      "section",
      "photo",
      duplicate?.id,
      "end",
    ]);
  });

  it("duplicates nested children with fresh ids", () => {
    const editor = makeEditor();
    const section = editor.getBlock("section")!;

    const [duplicate] = duplicateMenuBlocks(editor, section);

    expect(duplicate?.children[0]?.id).not.toBe("detail");
    expect(duplicate?.children[0]?.content).toEqual(section.children[0]?.content);
  });

  it("duplicates and removes the active selection as one action", () => {
    const editor = makeEditor();
    editor.setSelection("intro", "section");

    const duplicates = duplicateMenuBlocks(editor, editor.getBlock("intro")!);
    expect(duplicates).toHaveLength(2);
    expect(editor.document.slice(2, 4).map((block) => block.id)).toEqual(
      duplicates.map((block) => block.id),
    );

    removeMenuBlocks(editor, duplicates[0]!);
    expect(editor.document.map((block) => block.id)).toEqual(["intro", "section", "photo", "end"]);
  });

  it("turns text blocks into a supported type without changing text", () => {
    const editor = makeEditor();
    const intro = editor.getBlock("intro")!;

    expect(canTurnMenuBlocksInto(editor, intro)).toBe(true);
    turnMenuBlocksInto(editor, intro, { type: "heading", props: { level: 3 } });

    const converted = editor.getBlock("intro")!;
    expect(converted.type).toBe("heading");
    expect((converted.props as Record<string, unknown>).level).toBe(3);
    expect(converted.content).toEqual(intro.content);
  });

  it("does not offer text conversion for component blocks", () => {
    const editor = makeEditor();
    expect(canTurnMenuBlocksInto(editor, editor.getBlock("photo")!)).toBe(false);
  });
});
