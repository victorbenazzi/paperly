// @vitest-environment happy-dom
// Golden round-trip tests: markdown fixture -> blocks -> markdown.
// Guards against parser regressions when bumping BlockNote.
import { describe, expect, it } from "vitest";
import { BlockNoteEditor } from "@blocknote/core";

function makeEditor() {
  return BlockNoteEditor.create({ _headless: true });
}

async function roundtrip(md: string): Promise<string> {
  const editor = makeEditor();
  const blocks = await editor.tryParseMarkdownToBlocks(md);
  return editor.blocksToMarkdownLossy(blocks);
}

describe("markdown round-trip (lossy codec)", () => {
  it("preserves headings, paragraphs and emphasis", async () => {
    const out = await roundtrip("# Title\n\nSome **bold** and *italic* text.\n");
    expect(out).toContain("# Title");
    expect(out).toContain("**bold**");
    expect(out).toContain("*italic*");
  });

  it("preserves nested lists (bullet marker may normalize to *)", async () => {
    const out = await roundtrip("- a\n- b\n  - b1\n  - b2\n- c\n");
    expect(out).toMatch(/^[-*] a/m);
    expect(out).toMatch(/ {2}[-*] b1/);
  });

  it("preserves fenced code blocks with language", async () => {
    const out = await roundtrip("```ts\nconst x = 1;\n```\n");
    expect(out).toContain("```ts");
    expect(out).toContain("const x = 1;");
  });

  it("preserves task lists", async () => {
    const out = await roundtrip("- [ ] todo\n- [x] done\n");
    expect(out.toLowerCase()).toContain("[ ] todo");
    expect(out.toLowerCase()).toContain("[x] done");
  });

  it("preserves tables", async () => {
    const out = await roundtrip("| a | b |\n| - | - |\n| 1 | 2 |\n");
    expect(out).toContain("| a");
    expect(out).toContain("| 1");
  });

  it("preserves links", async () => {
    const out = await roundtrip("[site](https://example.com)\n");
    expect(out).toContain("[site](https://example.com)");
  });

  it("preserves standalone images (as image blocks)", async () => {
    const editor = makeEditor();
    const blocks = await editor.tryParseMarkdownToBlocks("![alt](assets/img.png)\n");
    const image = blocks.find((b) => b.type === "image");
    expect(image).toBeDefined();
    const out = await editor.blocksToMarkdownLossy(blocks);
    expect(out).toContain("assets/img.png");
  });

  // KNOWN LIMITATION: an image INSIDE a paragraph (inline) is dropped by the
  // parser; BlockNote only models images as blocks. Keep images on their own
  // line (the Notion/Obsidian convention). This test documents the behavior
  // so a future parser fix is noticed.
  it("documents that inline images inside paragraphs are dropped", async () => {
    const out = await roundtrip("text ![alt](assets/img.png) more\n");
    expect(out).not.toContain("assets/img.png");
  });

  it("is stable: a second round-trip equals the first (no churn)", async () => {
    const once = await roundtrip("# T\n\n- a\n  - b\n\n```js\n1\n```\n");
    const twice = await roundtrip(once);
    expect(twice).toBe(once);
  });
});
