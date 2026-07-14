import type { Block, BlockNoteEditor, PartialBlock } from "@blocknote/core";

type AnyBlock = Block<any, any, any>;
type AnyEditor = BlockNoteEditor<any, any, any>;

export type BlockConversion = {
  type: string;
  props?: Record<string, boolean | number | string>;
};

export function blocksForMenuAction(editor: AnyEditor, block: AnyBlock): AnyBlock[] {
  const selectedBlocks = editor.getSelection()?.blocks;
  return selectedBlocks?.some((selected) => selected.id === block.id)
    ? selectedBlocks
    : [block];
}

export function blockForInsertion(block: AnyBlock): PartialBlock<any, any, any> {
  const { id: _id, children, ...rest } = block;
  return {
    ...rest,
    children: children.map(blockForInsertion),
  } as PartialBlock<any, any, any>;
}

export function duplicateMenuBlocks(editor: AnyEditor, block: AnyBlock): AnyBlock[] {
  const blocks = blocksForMenuAction(editor, block);
  const reference = blocks[blocks.length - 1];
  if (!reference) return [];

  const inserted = editor.insertBlocks(blocks.map(blockForInsertion), reference, "after");
  if (inserted.length === 1) {
    editor.setTextCursorPosition(inserted[0]!, "start");
  } else if (inserted.length > 1) {
    editor.setSelection(inserted[0]!, inserted[inserted.length - 1]!);
  }
  return inserted;
}

export function removeMenuBlocks(editor: AnyEditor, block: AnyBlock): void {
  editor.removeBlocks(blocksForMenuAction(editor, block));
}

export function canTurnMenuBlocksInto(editor: AnyEditor, block: AnyBlock): boolean {
  return blocksForMenuAction(editor, block).every((candidate) => Array.isArray(candidate.content));
}

export function turnMenuBlocksInto(
  editor: AnyEditor,
  block: AnyBlock,
  conversion: BlockConversion,
): void {
  const blocks = blocksForMenuAction(editor, block);
  if (!blocks.every((candidate) => Array.isArray(candidate.content))) return;

  editor.transact(() => {
    for (const candidate of blocks) {
      editor.updateBlock(candidate, {
        type: conversion.type as any,
        props: conversion.props as any,
      });
    }
  });
  editor.focus();
}
