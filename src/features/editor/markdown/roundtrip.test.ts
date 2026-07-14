// @vitest-environment happy-dom
// Golden round-trip tests: markdown fixture -> blocks -> markdown.
// Guards against parser regressions when bumping BlockNote.
import { describe, expect, it } from "vitest";
import { BlockNoteEditor } from "@blocknote/core";
import { paperlySchema } from "@/components/editor/RawMarkdownBlock";
import type { PaperlyEditor } from "@/components/editor/RawMarkdownBlock";
import { assertPreservedMarkdown, codec } from "./codec";

function makeEditor(): PaperlyEditor {
  // _headless is the (typed-as-internal) flag server-util uses; fine in tests.
  const options = { _headless: true, schema: paperlySchema } as unknown as Parameters<
    typeof BlockNoteEditor.create
  >[0];
  return BlockNoteEditor.create(options) as PaperlyEditor;
}

async function roundtrip(md: string): Promise<string> {
  const editor = makeEditor();
  const blocks = await codec.markdownToBlocks(editor, md);
  editor.replaceBlocks(editor.document, blocks);
  return codec.blocksToMarkdown(editor);
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

  it("preserves inline images inside paragraphs", async () => {
    const out = await roundtrip("text ![alt](assets/img.png) more\n");
    expect(out).toContain("text ![alt](assets/img.png) more");
  });

  it("preserves raw HTML byte for byte", async () => {
    const raw = "<details>\n<summary>More</summary>\n<p>Exact HTML</p>\n</details>";
    const out = await roundtrip(`${raw}\n`);
    expect(out).toContain(raw);
  });

  it("preserves reference links and footnotes", async () => {
    const source = "A [reference][paperly] with a note[^1].\n\n[paperly]: https://paperly.test\n\n[^1]: Exact footnote.\n";
    const out = await roundtrip(source);
    expect(out).toContain("[reference][paperly]");
    expect(out).toContain("[paperly]: https://paperly.test");
    expect(out).toContain("[^1]: Exact footnote.");
  });

  it("does not transform wiki links inside preserved Markdown", async () => {
    const editor = makeEditor();
    const source = "<aside>Keep [[Alpha]] and [Alpha](Alpha.md) exact.</aside>\n";
    const blocks = await codec.markdownToBlocks(editor, source, "/vault");
    editor.replaceBlocks(editor.document, blocks);
    expect(await codec.blocksToMarkdown(editor, "/vault")).toBe(source);
  });

  it("is stable: a second round-trip equals the first (no churn)", async () => {
    const once = await roundtrip("# T\n\n- a\n  - b\n\n```js\n1\n```\n");
    const twice = await roundtrip(once);
    expect(twice).toBe(once);
  });

  it.each([
    ["Unicode", "Olá, 世界, 👋🏽 e café.\n"],
    ["malformed Markdown", "A [broken link and **unfinished emphasis.\n"],
    ["wiki links", "See [[Alpha]] and [[A page with spaces]].\n"],
    ["mixed code", "~~~rust\nfn main() { println!(\"ok\"); }\n~~~\n"],
  ])("does not lose semantic content from %s", async (_label, source) => {
    const out = await roundtrip(source);
    for (const token of source.match(/[\p{L}\p{N}\p{Emoji_Presentation}]+/gu) ?? []) {
      expect(out).toContain(token);
    }
  });

  it("rejects a serializer result that lost a preserved segment", () => {
    expect(() => assertPreservedMarkdown("safe native text", ["<custom>exact</custom>"]))
      .toThrow("disappeared or was truncated");
  });
});
