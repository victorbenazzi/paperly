import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useTreeStore } from "@/features/tree/tree.store";
import { useDragStore, type DropTarget, type DropLine } from "@/features/tree/drag.store";
import { useEditorStore } from "@/features/editor/editor.store";
import { remapPagePaths } from "@/features/pages/pagePaths";
import { buildNodes, isMarkdown, stripMdExt, type TreeNode } from "@/features/tree/tree.types";
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
  const order = useTreeStore((s) => s.order[dirPath]);
  const expanded = useTreeStore((s) => s.expanded);
  const toggleExpanded = useTreeStore((s) => s.toggleExpanded);
  const loadDir = useTreeStore((s) => s.loadDir);

  useEffect(() => {
    if (entries === undefined) void loadDir(dirPath);
  }, [entries, dirPath, loadDir]);

  if (!entries) return null;
  const nodes = buildNodes(entries, order);

  return (
    <>
      {nodes.map((node) => {
        const isOpen = node.dirPath !== null && expanded.has(node.dirPath);
        return (
          <div key={node.path} role="none">
            <TreeItem
              node={node}
              depth={depth}
              expanded={isOpen}
              onToggle={() => node.dirPath && toggleExpanded(node.dirPath)}
            />
            {isOpen && node.dirPath ? (
              <div role="group">
                <TreeLevel dirPath={node.dirPath} depth={depth + 1} />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/** Current visible sibling order (display names) for one dir. */
function visibleNames(dir: string): string[] {
  const s = useTreeStore.getState();
  return buildNodes(s.dirCache[dir] ?? [], s.order[dir]).map((n) => n.name);
}

/** Is `path` the dragged node itself or anything inside its subtree? */
function inDraggedSubtree(drag: TreeNode, path: string): boolean {
  return (
    path === drag.path ||
    (drag.dirPath !== null && (path === drag.dirPath || path.startsWith(`${drag.dirPath}/`)))
  );
}

/**
 * Translate the pointer position into a drop target. Rows are split into
 * zones: the edges mean "insert before/after this sibling" (rendered as a
 * line), the middle of a folder / folder-note row means "move inside"
 * (rendered as a highlight). The bottom edge of an EXPANDED folder points at
 * the slot before its first child. Anywhere else inside the tree drops into
 * the vault root.
 */
function resolveTarget(el: Element | null, y: number, drag: TreeNode): DropTarget | null {
  const row = el?.closest<HTMLElement>("[data-tree-row]");
  let target: DropTarget | null = null;

  if (row) {
    const path = row.dataset.path!;
    const name = row.dataset.name!;
    const parent = row.dataset.parent!;
    const dir = row.dataset.dir || null;
    const isExpanded = row.dataset.expanded === "1";
    const rect = row.getBoundingClientRect();
    const rel = (y - rect.top) / rect.height;
    const zone = dir
      ? rel < 0.25
        ? "above"
        : rel > 0.75
          ? "below"
          : "into"
      : rel < 0.5
        ? "above"
        : "below";

    if (path === drag.path) return null;
    if (zone === "into") {
      target = { kind: "into", dir: dir! };
    } else if (zone === "below" && dir && isExpanded) {
      target = {
        kind: "line",
        line: {
          parentDir: dir,
          anchorName: null,
          place: "first",
          rowPath: path,
          rowEdge: "below",
          indented: true,
        },
      };
    } else {
      target = {
        kind: "line",
        line: {
          parentDir: parent,
          anchorName: name,
          place: zone === "above" ? "before" : "after",
          rowPath: path,
          rowEdge: zone,
          indented: false,
        },
      };
    }
  } else {
    const zoneEl = el?.closest<HTMLElement>("[data-drop-dir]");
    if (zoneEl?.dataset.dropDir) target = { kind: "into", dir: zoneEl.dataset.dropDir };
  }

  // Never offer a target inside the dragged subtree, nor a no-op "into" the
  // dir the node already lives in.
  if (target?.kind === "into") {
    if (inDraggedSubtree(drag, target.dir) || target.dir === parentOf(drag.path)) return null;
  }
  if (target?.kind === "line" && inDraggedSubtree(drag, target.line.parentDir)) return null;
  return target;
}

/**
 * The vault file tree. Also hosts the global pointer-drag controller:
 * while a node is dragged, pointermove hit-tests rows via elementFromPoint
 * (pointer capture keeps events on the source row, so enter/leave on targets
 * never fire).
 */
export function FileTree({ rootPath }: { rootPath: string }) {
  const { t } = useTranslation();
  const dragging = useDragStore((s) => s.dragging);
  const target = useDragStore((s) => s.target);
  const moveNode = useTreeStore((s) => s.moveNode);
  const setOrder = useTreeStore((s) => s.setOrder);
  const { newPageAtRoot, newFolderAtRoot } = useRootActions();

  useEffect(() => {
    if (!dragging) return;
    document.body.setAttribute("data-tree-dragging", "");

    // A folder note's open children live under the companion dir; re-point
    // both paths or nav and the editor keep dead paths after the move.
    const remapMoved = (node: TreeNode, newPath: string) => {
      remapPagePaths(node.path, newPath);
      if (node.dirPath && node.dirPath !== node.path) {
        remapPagePaths(node.dirPath, stripMdExt(newPath));
      }
    };

    const applyLineDrop = async (node: TreeNode, line: DropLine) => {
      let movedName = node.name;
      if (parentOf(node.path) !== line.parentDir) {
        const newPath = await moveNode(node.path, node.dirPath, line.parentDir);
        remapMoved(node, newPath);
        const base = newPath.split("/").pop()!;
        movedName = isMarkdown(base) ? stripMdExt(base) : base;
      }
      const names = visibleNames(line.parentDir).filter((n) => n !== movedName);
      let idx = 0;
      if (line.place !== "first" && line.anchorName !== null) {
        const a = names.indexOf(line.anchorName);
        idx = a === -1 ? names.length : line.place === "before" ? a : a + 1;
      }
      names.splice(idx, 0, movedName);
      setOrder(line.parentDir, names);
    };

    const onMove = (e: PointerEvent) => {
      // Button no longer held (release happened where pointerup got lost,
      // e.g. outside the window): abort instead of dragging forever.
      if (e.buttons === 0) {
        useDragStore.getState().end();
        return;
      }
      useDragStore.getState().move(e.clientX, e.clientY);
      const drag = useDragStore.getState().dragging;
      if (!drag) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      useDragStore.getState().hover(resolveTarget(el, e.clientY, drag));
    };

    const onUp = async () => {
      const { dragging: node, target: t } = useDragStore.getState();
      useDragStore.getState().end();
      if (!node || !t) return;
      try {
        // Flush the open note before paths change under it (as renamePage
        // does); a pending autosave must not write through a stale path.
        const saved = await useEditorStore.getState().saveNow();
        if (!saved.ok && saved.reason !== "readOnly") throw new Error(saved.message);
        if (t.kind === "line") {
          await applyLineDrop(node, t.line);
        } else {
          const newPath = await moveNode(node.path, node.dirPath, t.dir);
          remapMoved(node, newPath);
        }
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
  }, [dragging, moveNode, setOrder]);

  // Spring-loaded folders: hovering a collapsed folder mid-drag pops it open
  // so the drag can continue into its children, Notion-style.
  const intoDir = target?.kind === "into" ? target.dir : null;
  useEffect(() => {
    if (!dragging || !intoDir || intoDir === rootPath) return;
    const timer = window.setTimeout(() => {
      const tree = useTreeStore.getState();
      if (!tree.expanded.has(intoDir)) tree.toggleExpanded(intoDir);
    }, SPRING_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [dragging, intoDir, rootPath]);

  const rootIsTarget = dragging !== null && intoDir === rootPath;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="tree"
          aria-label={t("sidebar.pages")}
          tabIndex={0}
          className={cn(
            "flex-1 overflow-y-auto px-2 pb-4 transition-colors duration-(--dur-fast)",
            "outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50 focus-visible:ring-inset",
            rootIsTarget && "rounded-md bg-accent-blue-soft/40 ring-1 ring-accent-blue/30 ring-inset",
          )}
          data-drop-dir={rootPath}
          onFocus={(event) => {
            if (event.target !== event.currentTarget) return;
            event.currentTarget.querySelector<HTMLElement>('[role="treeitem"]')?.focus();
          }}
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
