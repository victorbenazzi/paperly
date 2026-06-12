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
import { closeDeletedPaths, remapPagePaths } from "@/features/pages/pagePaths";
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
  const deleteNode = useTreeStore((s) => s.deleteNode);
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

  const activate = () => {
    if (dragJustEnded()) return;
    select(node.path);
    if (isPage || node.kind === "image") {
      openNote(node.path);
    } else if (node.kind === "file") {
      const ext = node.name.split(".").pop()?.toLowerCase() ?? "";
      if (TEXT_EXTS.has(ext)) openNote(node.path);
      else void ipc(CMD.openWithDefaultApp, { path: node.path }).catch(() => {});
    } else if (node.kind === "folder") {
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
      select(path);
      openNote(path);
      startRename(path);
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
    try {
      closeDeletedPaths(node.path, node.dirPath);
      await deleteNode(node.path, node.dirPath);
    } catch (err) {
      console.error("delete failed:", errorMessage(err));
    }
  };

  const reveal = () => void ipc(CMD.revealInFinder, { path: node.path }).catch(() => {});

  const Icon = KIND_ICON[node.kind];

  const row = (
    <div
      data-tree-row
      data-path={node.path}
      data-name={node.name}
      data-parent={node.path.slice(0, node.path.lastIndexOf("/"))}
      data-dir={node.dirPath ?? undefined}
      data-expanded={expanded ? "1" : undefined}
      className={cn(
        "group relative flex h-7 cursor-pointer items-center gap-1 rounded-sm pr-1 text-sm",
        "text-ink-secondary transition-colors duration-(--dur-fast)",
        selected ? "bg-hover-wash-strong text-ink" : "hover:bg-hover-wash hover:text-ink",
        isDropTarget && "bg-accent-blue-soft outline-1 outline-accent-blue/50 -outline-offset-1",
        dragging?.path === node.path && "opacity-40",
      )}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      onClick={activate}
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
            !dragging && "group-hover:flex",
            menuOpen && "flex",
          )}
        >
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("tree.more")}
                onClick={(e) => e.stopPropagation()}
                className="flex size-5 items-center justify-center rounded-xs text-ink-faint hover:bg-hover-wash-strong hover:text-ink"
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
                className="flex size-5 items-center justify-center rounded-xs text-ink-faint hover:bg-hover-wash-strong hover:text-ink"
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
                className="flex size-5 items-center justify-center rounded-xs text-ink-faint hover:bg-hover-wash-strong hover:text-ink"
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
