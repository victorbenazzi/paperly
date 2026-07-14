import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { expandWikiLinks, collapseWikiLinks } from "./wikiLinks";
import type { PaperlyBlock, PaperlyEditor } from "@/components/editor/RawMarkdownBlock";
import i18n from "@/features/i18n/config";

type MarkdownSegment = {
  kind: "native" | "raw";
  source: string;
};

type MarkdownNode = {
  type: string;
  children?: MarkdownNode[];
  position?: {
    start: { offset?: number };
    end: { offset?: number };
  };
};

type MarkdownRoot = MarkdownNode & { children: MarkdownNode[] };

const SAFE_NODE_TYPES = new Set([
  "root",
  "paragraph",
  "heading",
  "blockquote",
  "code",
  "list",
  "listItem",
  "thematicBreak",
  "table",
  "tableRow",
  "tableCell",
  "text",
  "emphasis",
  "strong",
  "delete",
  "inlineCode",
  "link",
  "break",
]);

const markdownParser = unified().use(remarkParse).use(remarkGfm);

function isStandaloneImageParagraph(node: MarkdownNode): boolean {
  return (
    node.type === "paragraph" &&
    node.children?.length === 1 &&
    node.children[0]?.type === "image"
  );
}

function isSafeNode(node: MarkdownNode, allowImage = false): boolean {
  if (node.type === "image") return allowImage;
  if (!SAFE_NODE_TYPES.has(node.type)) return false;
  return (node.children ?? []).every((child) => isSafeNode(child, false));
}

function isSafeTopLevel(node: MarkdownNode): boolean {
  if (isStandaloneImageParagraph(node)) return true;
  return isSafeNode(node);
}

function segmentMarkdown(markdown: string): MarkdownSegment[] {
  const tree = markdownParser.parse(markdown) as unknown as MarkdownRoot;
  if (tree.children.length === 0) return [{ kind: "native", source: markdown }];

  return tree.children.map((node, index) => {
    const start = index === 0 ? 0 : (node.position?.start.offset ?? 0);
    const next = tree.children[index + 1];
    const end = next?.position?.start.offset ?? markdown.length;
    return {
      kind: isSafeTopLevel(node) ? "native" : "raw",
      source: markdown.slice(start, end),
    };
  });
}

function appendPiece(output: string, piece: string): string {
  if (!output) return piece;
  if (!piece) return output;
  if (output.endsWith("\n\n") || piece.startsWith("\n")) return output + piece;
  if (output.endsWith("\n")) return `${output}\n${piece}`;
  return `${output}\n\n${piece}`;
}

export function assertPreservedMarkdown(output: string, preserved: string[]): void {
  let cursor = 0;
  for (const source of preserved) {
    if (!source) continue;
    const index = output.indexOf(source, cursor);
    if (index === -1) {
      throw new Error(i18n.t("editor.errors.preservedMissing"));
    }
    cursor = index + source.length;
  }
}

export interface MarkdownCodec {
  blocksToMarkdown: (editor: PaperlyEditor, vaultPath?: string) => Promise<string>;
  markdownToBlocks: (
    editor: PaperlyEditor,
    markdown: string,
    vaultPath?: string,
  ) => Promise<PaperlyBlock[]>;
}

export const codec: MarkdownCodec = {
  async blocksToMarkdown(editor, vaultPath) {
    let output = "";
    let nativeBlocks: PaperlyBlock[] = [];
    const preserved: string[] = [];

    const flushNative = async () => {
      if (nativeBlocks.length === 0) return;
      const serialized = await editor.blocksToMarkdownLossy(nativeBlocks);
      const markdown = vaultPath ? collapseWikiLinks(serialized, vaultPath) : serialized;
      output = appendPiece(output, markdown);
      nativeBlocks = [];
    };

    for (const block of editor.document) {
      if (block.type !== "rawMarkdown") {
        nativeBlocks.push(block);
        continue;
      }
      await flushNative();
      const source = (block.props as Record<string, unknown>).source;
      if (typeof source !== "string") {
        throw new Error(i18n.t("editor.errors.preservedInvalid"));
      }
      preserved.push(source);
      output = appendPiece(output, source);
    }
    await flushNative();
    assertPreservedMarkdown(output, preserved);
    return output;
  },

  async markdownToBlocks(editor, markdown, vaultPath) {
    const segments = segmentMarkdown(markdown);
    const blocks: PaperlyBlock[] = [];
    let nativeSource = "";

    const flushNative = async () => {
      if (!nativeSource) return;
      blocks.push(...(await editor.tryParseMarkdownToBlocks(nativeSource)));
      nativeSource = "";
    };

    for (const segment of segments) {
      if (segment.kind === "native") {
        nativeSource += vaultPath ? expandWikiLinks(segment.source, vaultPath) : segment.source;
        continue;
      }
      await flushNative();
      blocks.push({
        id: crypto.randomUUID(),
        type: "rawMarkdown",
        props: { source: segment.source },
        content: undefined,
        children: [],
      } as unknown as PaperlyBlock);
    }
    await flushNative();
    return blocks;
  },
};
