import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  FileText,
  Folder,
  File as FileIcon,
  Image as ImageIcon,
  MoreHorizontal,
  Plus,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/ipc";
import { TEXT_EXTS, type TreeNode } from "@/features/tree/tree.types";
import { useTreeStore } from "@/features/tree/tree.store";
import { useDragStore, dragJustEnded } from "@/features/tree/drag.store";
import { useNavStore } from "@/features/nav/nav.store";
import { usePageMetaStore } from "@/features/pages/pageMeta.store";
import { remapPagePaths } from "@/features/pages/pagePaths";
import { deletePageFlow } from "@/features/pages/deletePageFlow";
import { renamePage } from "@/features/pages/renamePage";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CMD, ipc } from "@/lib/ipc";

export const KIND_ICON = {
  note: FileText,
  folderNote: FileText,
  folder: Folder,
  image: ImageIcon,
  file: FileIcon,
} as const;

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
}

export function TreeItem({ node, depth, expanded, onToggle }: TreeItemProps) {
  const { t } = useTranslation();
  const select = useTreeStore((s) => s.select);
  const selected = useTreeStore((s) => s.selectedPath === node.path);
  const renaming = useTreeStore((s) => s.renamingPath === node.path);
  const startRename = useTreeStore((s) => s.startRename);
  const renameNode = useTreeStore((s) => s.renameNode);
  const createNote = useTreeStore((s) => s.createNote);
  const toggleExpanded = useTreeStore((s) => s.toggleExpanded);
  const createFolder = useTreeStore((s) => s.createFolder);
  const openNote = useNavStore((s) => s.open);

  const dragging = useDragStore((s) => s.dragging);
  const dropTarget = useDragStore((s) => s.target);
  const beginDrag = useDragStore((s) => s.begin);

  const isPage = node.kind === "note" || node.kind === "folderNote";

  // Emoji icon from the page's frontmatter; falls back to the kind icon.
  const pageIcon = usePageMetaStore((s) => (isPage ? s.icons[node.path] : undefined));
  const requestIcon = usePageMetaStore((s) => s.request);
  useEffect(() => {
    if (isPage && pageIcon === undefined) requestIcon(node.path);
  }, [isPage, pageIcon, node.path, requestIcon]);

  const [draft, setDraft] = useState(node.name);
  // The row actions live in a hover-only span. While the "more" menu is open
  // the trigger must stay laid out, or Radix loses its anchor rect and the
  // menu snaps to the viewport's top-left corner.
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (renaming) {
      setDraft(node.name);
      // focus after the input mounts
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [renaming, node.name]);

  const expandable = node.dirPath !== null;
  const isDropTarget =
    dragging !== null &&
    dropTarget?.kind === "into" &&
    node.dirPath !== null &&
    dropTarget.dir === node.dirPath;
  // Insertion line: this row renders it when the hovered slot is one of its
  // edges (reorder feedback, Notion-style).
  const dropLine =
    dragging !== null && dropTarget?.kind === "line" && dropTarget.line.rowPath === node.path
      ? dropTarget.line
      : null;

  const activate = async () => {
    if (dragJustEnded()) return;
    if (isPage || node.kind === "image") {
      if (await openNote(node.path)) select(node.path);
    } else if (node.kind === "file") {
      const ext = node.name.split(".").pop()?.toLowerCase() ?? "";
      if (TEXT_EXTS.has(ext)) {
        if (await openNote(node.path)) select(node.path);
      } else {
        void ipc(CMD.openWithDefaultApp, { path: node.path }).catch(() => {});
      }
    } else if (node.kind === "folder") {
      select(node.path);
      onToggle();
    }
  };

  const commitRename = async () => {
    const name = draft.trim();
    startRename(null);
    if (!name || name === node.name) return;
    try {
      if (isPage) {
        // Canonical page rename: flushes the editor first and re-points
        // nav, editor, icon cache and selection at the new paths.
        await renamePage(node.path, name);
      } else {
        const newPath = await renameNode(node.path, node.dirPath, name);
        remapPagePaths(node.path, newPath);
        select(newPath);
      }
    } catch (err) {
      console.error("rename failed:", errorMessage(err));
    }
  };

  const addSubpage = async () => {
    try {
      let dir = node.dirPath;
      if (isPage && !dir) {
        // First subpage turns a plain note into a folder note: create `X/`.
        const parent = node.path.slice(0, node.path.lastIndexOf("/"));
        dir = await createFolder(parent, node.name);
      }
      if (!dir) return;
      const path = await createNote(dir, t("tree.untitled"));
      if (!useTreeStore.getState().expanded.has(dir)) toggleExpanded(dir);
      await useTreeStore.getState().loadDir(dir);
      if (await openNote(path, { focus: "title" })) select(path);
    } catch (err) {
      console.error("add subpage failed:", errorMessage(err));
    }
  };

  const addSubfolder = async () => {
    try {
      let dir = node.dirPath;
      if (isPage && !dir) {
        const parent = node.path.slice(0, node.path.lastIndexOf("/"));
        dir = await createFolder(parent, node.name);
      }
      if (!dir) return;
      const path = await createFolder(dir, t("tree.untitledFolder"));
      if (!useTreeStore.getState().expanded.has(dir)) toggleExpanded(dir);
      await useTreeStore.getState().loadDir(dir);
      select(path);
      startRename(path);
    } catch (err) {
      console.error("add subfolder failed:", errorMessage(err));
    }
  };

  const remove = async () => {
    await deletePageFlow(node.path, node.dirPath);
  };

  const reveal = () => void ipc(CMD.revealInFinder, { path: node.path }).catch(() => {});

  const Icon = KIND_ICON[node.kind];

  const handleTreeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const tree = event.currentTarget.closest<HTMLElement>('[role="tree"]');
    if (!tree) return;
    const rows = Array.from(tree.querySelectorAll<HTMLElement>('[role="treeitem"]'));
    const index = rows.indexOf(event.currentTarget);
    const focusAt = (next: number) => rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus();

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(rows.length - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (expandable && !expanded) onToggle();
      else if (expandable && rows[index + 1]?.getAttribute("aria-level") === String(depth + 2)) {
        focusAt(index + 1);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (expandable && expanded) {
        onToggle();
      } else {
        const parentLevel = depth;
        for (let previous = index - 1; previous >= 0; previous -= 1) {
          if (rows[previous]?.getAttribute("aria-level") === String(parentLevel)) {
            rows[previous]?.focus();
            break;
          }
        }
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      void activate();
    } else if (event.key === "F2") {
      event.preventDefault();
      startRename(node.path);
    } else if (event.key === "Delete") {
      event.preventDefault();
      void remove();
    } else if (event.key === "Escape") {
      event.preventDefault();
      startRename(null);
      useDragStore.getState().end();
    }
  };

  const row = (
    <div
      role="treeitem"
      aria-label={node.name}
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={expandable ? expanded : undefined}
      tabIndex={selected ? 0 : -1}
      data-tree-row
      data-path={node.path}
      data-name={node.name}
      data-parent={node.path.slice(0, node.path.lastIndexOf("/"))}
      data-dir={node.dirPath ?? undefined}
      data-expanded={expanded ? "1" : undefined}
      className={cn(
        "group relative flex h-8 cursor-pointer items-center gap-1 rounded-sm pr-1 text-sm outline-none",
        "text-ink-secondary transition-colors duration-(--dur-fast)",
        "focus-visible:ring-2 focus-visible:ring-accent-blue/50 focus-visible:ring-inset",
        selected ? "bg-hover-wash-strong text-ink" : "hover:bg-hover-wash hover:text-ink",
        isDropTarget && "bg-accent-blue-soft outline-1 outline-accent-blue/50 -outline-offset-1",
        dragging?.path === node.path && "opacity-40",
      )}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      onClick={() => void activate()}
      onFocus={() => select(node.path)}
      onKeyDown={handleTreeKeyDown}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        pressRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!pressRef.current || dragging) return;
        // The press may have been released outside this row (its pointerup
        // never fires); only a held left button counts as a drag intent.
        if (e.buttons !== 1) {
          pressRef.current = null;
          return;
        }
        const dx = e.clientX - pressRef.current.x;
        const dy = e.clientY - pressRef.current.y;
        if (Math.hypot(dx, dy) > 6) beginDrag(node, e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        pressRef.current = null;
      }}
    >
      {dropLine ? (
        // Insertion indicator: a line on the row edge where the drop lands,
        // indented one extra level when it means "first child of this folder".
        <span
          className="pointer-events-none absolute right-1 z-10 flex items-center"
          style={{
            left: `${8 + (depth + (dropLine.indented ? 1 : 0)) * 14}px`,
            [dropLine.rowEdge === "above" ? "top" : "bottom"]: "-4px",
          }}
        >
          <span className="size-[7px] shrink-0 rounded-full border-[1.5px] border-accent-blue bg-canvas" />
          <span className="h-[3px] min-w-0 flex-1 rounded-full bg-accent-blue" />
        </span>
      ) : null}
      <span
        role="presentation"
        className={cn(
          "flex size-4 shrink-0 items-center justify-center text-ink-faint",
          expandable && "hover:text-ink",
        )}
        onClick={(e) => {
          if (!expandable) return;
          e.stopPropagation();
          onToggle();
        }}
      >
        {expandable ? (
          <ChevronRight
            size={13}
            className={cn("transition-transform duration-(--dur-fast)", expanded && "rotate-90")}
          />
        ) : null}
      </span>

      {pageIcon ? (
        <span className="flex size-[15px] shrink-0 items-center justify-center text-[13px] leading-none">
          {pageIcon}
        </span>
      ) : (
        <Icon size={15} className="shrink-0 text-ink-muted" />
      )}

      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") void commitRename();
            if (e.key === "Escape") startRename(null);
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded-xs border border-accent-blue/50 bg-surface px-1 text-sm text-ink outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      )}

      {!renaming ? (
        // Hidden while dragging so the buttons don't flicker under the ghost.
        <span
          className={cn(
            "hidden shrink-0 items-center gap-0.5",
            !dragging && "group-hover:flex group-focus-within:flex",
            menuOpen && "flex",
          )}
        >
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("tree.more")}
                onClick={(e) => e.stopPropagation()}
                className="flex size-7 items-center justify-center rounded-xs text-ink-muted hover:bg-hover-wash-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-blue/50"
              >
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" sideOffset={4} onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => startRename(node.path)}>
                {t("tree.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={reveal}>{t("tree.reveal")}</DropdownMenuItem>
              {(isPage || node.kind === "folder") && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void addSubpage()}>
                    {t("tree.newSubpage")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void addSubfolder()}>
                    {t("tree.newFolder")}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
                {t("tree.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isPage || node.kind === "folder" ? (
            <>
              <button
                type="button"
                aria-label={t("tree.newFolder")}
                onClick={(e) => {
                  e.stopPropagation();
                  void addSubfolder();
                }}
                className="flex size-7 items-center justify-center rounded-xs text-ink-muted hover:bg-hover-wash-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-blue/50"
              >
                <Folder size={14} />
              </button>
              <button
                type="button"
                aria-label={t("tree.newSubpage")}
                onClick={(e) => {
                  e.stopPropagation();
                  void addSubpage();
                }}
                className="flex size-7 items-center justify-center rounded-xs text-ink-muted hover:bg-hover-wash-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-blue/50"
              >
                <Plus size={14} />
              </button>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => startRename(node.path)}>
          {t("tree.rename")}
        </ContextMenuItem>
        {isPage || node.kind === "folder" ? (
          <>
            <ContextMenuItem onClick={() => void addSubpage()}>
              {t("tree.newSubpage")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => void addSubfolder()}>
              {t("tree.newFolder")}
            </ContextMenuItem>
          </>
        ) : null}
        <ContextMenuItem onClick={reveal}>{t("tree.reveal")}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => void remove()}>
          {t("tree.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
