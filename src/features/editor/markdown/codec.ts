import type { Block, BlockNoteEditor } from "@blocknote/core";

/**
 * The single seam between BlockNote documents and the markdown on disk.
 * Today it delegates to the core lossy converters (MIT). If fidelity ever
 * needs the xl-markdown package (AGPL/dual), only this file changes.
 *
 * Known, accepted losses (hidden from the UI): text/background colors and
 * alignment. What markdown can't say, noteflow doesn't promise.
 */
export interface MarkdownCodec {
  blocksToMarkdown: (editor: BlockNoteEditor) => Promise<string>;
  markdownToBlocks: (editor: BlockNoteEditor, markdown: string) => Promise<Block[]>;
}

export const codec: MarkdownCodec = {
  async blocksToMarkdown(editor) {
    return editor.blocksToMarkdownLossy(editor.document);
  },
  async markdownToBlocks(editor, markdown) {
    return editor.tryParseMarkdownToBlocks(markdown);
  },
};
