import { useDragStore } from "@/features/tree/drag.store";
import { KIND_ICON } from "./TreeItem";

/**
 * Floating pill that follows the pointer while a tree node is dragged,
 * Notion-style. Purely presentational; drop logic lives in FileTree.
 */
export function DragGhost() {
  const dragging = useDragStore((s) => s.dragging);
  const x = useDragStore((s) => s.x);
  const y = useDragStore((s) => s.y);

  if (!dragging) return null;
  const Icon = KIND_ICON[dragging.kind];

  return (
    <div
      className="pointer-events-none fixed z-50 flex max-w-56 items-center gap-1.5 rounded-md border border-hairline bg-surface px-2 py-1 text-sm text-ink opacity-90 shadow-elevated"
      style={{ left: x + 10, top: y + 12 }}
    >
      <Icon size={14} className="shrink-0 text-ink-muted" />
      <span className="truncate">{dragging.name}</span>
    </div>
  );
}
