import { useEffect } from "react";

import { useTreeStore } from "@/features/tree/tree.store";
import { useDragStore } from "@/features/tree/drag.store";
import { useNavStore } from "@/features/nav/nav.store";
import { buildNodes } from "@/features/tree/tree.types";
import { TreeItem } from "./TreeItem";

function TreeLevel({ dirPath, depth }: { dirPath: string; depth: number }) {
  const entries = useTreeStore((s) => s.dirCache[dirPath]);
  const expanded = useTreeStore((s) => s.expanded);
  const toggleExpanded = useTreeStore((s) => s.toggleExpanded);
  const loadDir = useTreeStore((s) => s.loadDir);

  useEffect(() => {
    if (entries === undefined) void loadDir(dirPath);
  }, [entries, dirPath, loadDir]);

  if (!entries) return null;
  const nodes = buildNodes(entries);

  return (
    <>
      {nodes.map((node) => {
        const isOpen = node.dirPath !== null && expanded.has(node.dirPath);
        return (
          <div key={node.path}>
            <TreeItem
              node={node}
              depth={depth}
              expanded={isOpen}
              onToggle={() => node.dirPath && toggleExpanded(node.dirPath)}
            />
            {isOpen && node.dirPath ? (
              <TreeLevel dirPath={node.dirPath} depth={depth + 1} />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/**
 * The vault file tree. Also hosts the global pointer-drag controller:
 * while a node is dragged, pointermove hit-tests `data-drop-dir` ancestors
 * via elementFromPoint (pointer capture keeps events on the source row, so
 * enter/leave on targets never fire).
 */
export function FileTree({ rootPath }: { rootPath: string }) {
  const dragging = useDragStore((s) => s.dragging);
  const moveNode = useTreeStore((s) => s.moveNode);
  const remapNav = useNavStore((s) => s.remap);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest<HTMLElement>("[data-drop-dir]");
      useDragStore.getState().hover(target?.dataset.dropDir ?? null);
    };
    const onUp = async () => {
      const { dragging: node, dropDir } = useDragStore.getState();
      useDragStore.getState().end();
      if (!node || !dropDir) return;
      if (dropDir === node.path || dropDir === node.dirPath) return;
      try {
        const newPath = await moveNode(node.path, node.dirPath, dropDir);
        remapNav(node.path, newPath);
      } catch (err) {
        console.error("move failed:", err);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, moveNode, remapNav]);

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-4" data-drop-dir={rootPath}>
      <TreeLevel dirPath={rootPath} depth={0} />
    </div>
  );
}
