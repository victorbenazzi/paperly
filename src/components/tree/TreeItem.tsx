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
import { useDragStore } from "@/features/tree/drag.store";
import { useNavStore } from "@/features/nav/nav.store";
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

const KIND_ICON = {
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
  const remapNav = useNavStore((s) => s.remap);

  const dragging = useDragStore((s) => s.dragging);
  const dropDir = useDragStore((s) => s.dropDir);
  const beginDrag = useDragStore((s) => s.begin);

  const [draft, setDraft] = useState(node.name);
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

  const isPage = node.kind === "note" || node.kind === "folderNote";
  const expandable = node.dirPath !== null;
  const isDropTarget = dragging && node.dirPath && dropDir === node.dirPath && dragging.path !== node.path;

  const activate = () => {
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
      const newPath = await renameNode(node.path, node.dirPath, name);
      remapNav(node.path, newPath);
      if (node.dirPath) remapNav(node.dirPath, newPath.replace(/\.md$/i, ""));
      select(newPath);
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

  const remove = async () => {
    try {
      await deleteNode(node.path, node.dirPath);
    } catch (err) {
      console.error("delete failed:", errorMessage(err));
    }
  };

  const reveal = () => void ipc(CMD.revealInFinder, { path: node.path }).catch(() => {});

  const Icon = KIND_ICON[node.kind];

  const row = (
    <div
      data-drop-dir={node.dirPath ?? undefined}
      className={cn(
        "group flex h-7 cursor-default items-center gap-1 rounded-sm pr-1 text-sm",
        "text-ink-secondary transition-colors duration-(--dur-fast)",
        selected ? "bg-hover-wash-strong text-ink" : "hover:bg-hover-wash hover:text-ink",
        isDropTarget && "bg-accent-blue-soft outline-1 outline-accent-blue/40",
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
        const dx = e.clientX - pressRef.current.x;
        const dy = e.clientY - pressRef.current.y;
        if (Math.hypot(dx, dy) > 6) beginDrag(node);
      }}
      onPointerUp={() => {
        pressRef.current = null;
      }}
    >
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

      <Icon size={15} className="shrink-0 text-ink-muted" />

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
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <DropdownMenu>
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
            <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => startRename(node.path)}>
                {t("tree.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={reveal}>{t("tree.reveal")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
                {t("tree.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isPage || node.kind === "folder" ? (
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
          <ContextMenuItem onClick={() => void addSubpage()}>
            {t("tree.newSubpage")}
          </ContextMenuItem>
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
