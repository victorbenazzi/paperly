import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useTreeStore } from "@/features/tree/tree.store";
import { useDragStore } from "@/features/tree/drag.store";
import { useNavStore } from "@/features/nav/nav.store";
import { buildNodes } from "@/features/tree/tree.types";
import { useRootActions } from "@/features/tree/useRootActions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { TreeItem } from "./TreeItem";
import { DragGhost } from "./DragGhost";

/** How long a collapsed folder is hovered during a drag before it opens. */
const SPRING_LOAD_MS = 650;

const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/"));

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
  const { t } = useTranslation();
  const dragging = useDragStore((s) => s.dragging);
  const dropDir = useDragStore((s) => s.dropDir);
  const moveNode = useTreeStore((s) => s.moveNode);
  const remapNav = useNavStore((s) => s.remap);
  const { newPageAtRoot, newFolderAtRoot } = useRootActions();

  useEffect(() => {
    if (!dragging) return;
    document.body.setAttribute("data-tree-dragging", "");
    const onMove = (e: PointerEvent) => {
      // Button no longer held (release happened where pointerup got lost,
      // e.g. outside the window): abort instead of dragging forever.
      if (e.buttons === 0) {
        useDragStore.getState().end();
        return;
      }
      useDragStore.getState().move(e.clientX, e.clientY);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest<HTMLElement>("[data-drop-dir]");
      useDragStore.getState().hover(target?.dataset.dropDir ?? null);
    };
    const onUp = async () => {
      const { dragging: node, dropDir: dir } = useDragStore.getState();
      useDragStore.getState().end();
      if (!node || !dir) return;
      // No-ops: dropping a folder onto itself, a folder note onto its own
      // companion dir, or any node back into the dir it already lives in.
      if (dir === node.path || dir === node.dirPath || dir === parentOf(node.path)) return;
      try {
        const newPath = await moveNode(node.path, node.dirPath, dir);
        remapNav(node.path, newPath);
      } catch (err) {
        console.error("move failed:", err);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useDragStore.getState().end();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.removeAttribute("data-tree-dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [dragging, moveNode, remapNav]);

  // Spring-loaded folders: hovering a collapsed folder mid-drag pops it open
  // so the drag can continue into its children, Notion-style.
  useEffect(() => {
    if (!dragging || !dropDir || dropDir === rootPath) return;
    const timer = window.setTimeout(() => {
      const tree = useTreeStore.getState();
      if (!tree.expanded.has(dropDir)) tree.toggleExpanded(dropDir);
    }, SPRING_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [dragging, dropDir, rootPath]);

  const rootIsTarget =
    dragging !== null && dropDir === rootPath && parentOf(dragging.path) !== rootPath;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex-1 overflow-y-auto px-2 pb-4 transition-colors duration-(--dur-fast)",
            rootIsTarget && "rounded-md bg-accent-blue-soft/40 ring-1 ring-accent-blue/30 ring-inset",
          )}
          data-drop-dir={rootPath}
        >
          <TreeLevel dirPath={rootPath} depth={0} />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => void newPageAtRoot()}>
          {t("sidebar.newPage")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void newFolderAtRoot()}>
          {t("sidebar.newFolder")}
        </ContextMenuItem>
      </ContextMenuContent>
      <DragGhost />
    </ContextMenu>
  );
}
