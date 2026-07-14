import type { Block, BlockNoteEditor } from "@blocknote/core";

export type BlockDropPlacement = "before" | "after";

export type BlockDropGeometry = {
  id: string;
  top: number;
  bottom: number;
};

export function resolveVerticalDropTarget(
  candidates: BlockDropGeometry[],
  clientY: number,
): { id: string; placement: BlockDropPlacement } | null {
  let closest: BlockDropGeometry | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  let closestHeight = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const height = Math.max(0, candidate.bottom - candidate.top);
    const distance =
      clientY < candidate.top
        ? candidate.top - clientY
        : clientY > candidate.bottom
          ? clientY - candidate.bottom
          : 0;

    if (distance < closestDistance || (distance === closestDistance && height < closestHeight)) {
      closest = candidate;
      closestDistance = distance;
      closestHeight = height;
    }
  }

  if (!closest) return null;
  const placement = clientY < closest.top + (closest.bottom - closest.top) / 2
    ? "before"
    : "after";
  return { id: closest.id, placement };
}

function containsBlock(block: Block, blockId: string): boolean {
  return block.id === blockId || block.children.some((child) => containsBlock(child, blockId));
}

function resolveReorderContext(
  editor: BlockNoteEditor,
  sourceId: string,
  targetId: string,
): { sources: Block[]; target: Block } | null {
  const source = editor.getBlock(sourceId);
  const target = editor.getBlock(targetId);
  if (!source || !target) return null;

  const selected = editor.getSelection()?.blocks ?? [];
  const sources = selected.some((block) => block.id === sourceId) ? selected : [source];
  if (sources.some((block) => containsBlock(block, targetId))) return null;
  return { sources, target };
}

export function canReorderBlock(
  editor: BlockNoteEditor,
  sourceId: string,
  targetId: string,
): boolean {
  return resolveReorderContext(editor, sourceId, targetId) !== null;
}

function siblingIds(blocks: Block[], sourceId: string, targetId: string): string[] | null {
  const ids = blocks.map((block) => block.id);
  if (ids.includes(sourceId) && ids.includes(targetId)) return ids;

  for (const block of blocks) {
    const nested = siblingIds(block.children, sourceId, targetId);
    if (nested) return nested;
  }

  return null;
}

/**
 * Moves one complete BlockNote block through the editor's public mutation API.
 * Children and component props travel with the block in a single transaction.
 */
export function reorderBlock(
  editor: BlockNoteEditor,
  sourceId: string,
  targetId: string,
  placement: BlockDropPlacement,
): boolean {
  const context = resolveReorderContext(editor, sourceId, targetId);
  if (!context) return false;
  const { sources, target } = context;

  const siblings = sources.length === 1 ? siblingIds(editor.document, sourceId, targetId) : null;
  if (siblings && sources.length === 1) {
    const sourceIndex = siblings.indexOf(sourceId);
    const targetIndex = siblings.indexOf(targetId);
    const alreadyThere =
      (placement === "before" && sourceIndex + 1 === targetIndex) ||
      (placement === "after" && targetIndex + 1 === sourceIndex);
    if (alreadyThere) return false;
  }

  editor.transact(() => {
    editor.removeBlocks(sources);
    editor.insertBlocks(sources, target, placement);
    if (sources.length > 1) {
      editor.setSelection(sources[0], sources[sources.length - 1]);
    } else {
      editor.setTextCursorPosition(sources[0], "start");
    }
  });
  return true;
}
