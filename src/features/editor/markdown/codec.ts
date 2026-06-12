import type { Block, BlockNoteEditor } from "@blocknote/core";

import { expandWikiLinks, collapseWikiLinks } from "./wikiLinks";

/**
 * The single seam between BlockNote documents and the markdown on disk.
 * Today it delegates to the core lossy converters (MIT). If fidelity ever
 * needs the xl-markdown package (AGPL/dual), only this file changes.
 *
 * Known, accepted losses (hidden from the UI): text/background colors and
 * alignment. What markdown can't say, Paperly doesn't promise.
 *
 * Wiki-links `[[Note Name]]` are expanded to vault-relative markdown links
 * on load and collapsed back on save, keeping the on-disk format clean.
 * Callers must `ensureWikiIndex` before parsing or links won't resolve.
 */
export interface MarkdownCodec {
  blocksToMarkdown: (editor: BlockNoteEditor, vaultPath?: string) => Promise<string>;
  markdownToBlocks: (editor: BlockNoteEditor, markdown: string, vaultPath?: string) => Promise<Block[]>;
}

export const codec: MarkdownCodec = {
  async blocksToMarkdown(editor, vaultPath) {
    const md = await editor.blocksToMarkdownLossy(editor.document);
    return vaultPath ? collapseWikiLinks(md, vaultPath) : md;
  },
  async markdownToBlocks(editor, markdown, vaultPath) {
    const expanded = vaultPath ? expandWikiLinks(markdown, vaultPath) : markdown;
    return editor.tryParseMarkdownToBlocks(expanded);
  },
};
