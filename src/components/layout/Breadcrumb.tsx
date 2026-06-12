import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Smile } from "lucide-react";

import { CMD, ipc, errorMessage } from "@/lib/ipc";
import { isMarkdown, stripMdExt } from "@/features/tree/tree.types";
import { useNavStore } from "@/features/nav/nav.store";
import { useTreeStore } from "@/features/tree/tree.store";
import { useEditorStore } from "@/features/editor/editor.store";
import { usePageMetaStore } from "@/features/pages/pageMeta.store";
import { useVaultsStore, activeVault } from "@/features/vaults/vaults.store";
import { renamePage } from "@/features/pages/renamePage";
import { IconPickerPopover } from "@/components/page/EmojiPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

/**
 * Ancestor segment: a folder on the open note's path. Folder notes (`X/` with
 * a sibling `X.md`) open as pages on click; plain folders are revealed in the
 * tree instead.
 */
function AncestorCrumb({ dirPath, name }: { dirPath: string; name: string }) {
  const mdPath = `${dirPath}.md`;
  const icon = usePageMetaStore((s) => s.icons[mdPath]);
  const request = usePageMetaStore((s) => s.request);
  const openNote = useNavStore((s) => s.open);
  const select = useTreeStore((s) => s.select);

  useEffect(() => request(mdPath), [mdPath, request]);

  const activate = async () => {
    try {
      await ipc(CMD.stat, { path: mdPath });
      openNote(mdPath);
      select(mdPath);
    } catch {
      select(dirPath);
      if (!useTreeStore.getState().expanded.has(dirPath)) {
        useTreeStore.getState().toggleExpanded(dirPath);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={() => void activate()}
      className="flex max-w-40 shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-sm text-ink-muted transition-colors duration-(--dur-fast) hover:bg-hover-wash hover:text-ink"
    >
      {icon ? <span className="text-[13px] leading-none">{icon}</span> : null}
      <span className="truncate">{name}</span>
    </button>
  );
}

/**
 * Last segment: the open page. Clicking opens a Notion-style inline rename
 * popover (icon button + name input); the icon button nests the emoji picker.
 */
function CurrentCrumb({ path }: { path: string }) {
  const { t } = useTranslation();
  const fileName = path.split("/").pop() ?? "";
  const md = isMarkdown(fileName);
  const name = md ? stripMdExt(fileName) : fileName;

  const metaIcon = useEditorStore((s) => (typeof s.meta.icon === "string" ? s.meta.icon : null));
  const cachedIcon = usePageMetaStore((s) => s.icons[path] ?? null);
  const request = usePageMetaStore((s) => s.request);
  const setIcon = useEditorStore((s) => s.setIcon);
  const icon = metaIcon ?? cachedIcon;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const skipCommit = useRef(false);

  useEffect(() => setDraft(name), [name, open]);
  useEffect(() => {
    if (md) request(path);
  }, [md, path, request]);

  if (!md) {
    return (
      <span className="min-w-0 truncate px-1.5 py-0.5 text-sm text-ink">{name}</span>
    );
  }

  const commit = async () => {
    const next = draft.trim();
    if (!next || next === name) return;
    try {
      await renamePage(path, next);
    } catch (err) {
      console.error("breadcrumb rename failed:", errorMessage(err));
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (!o && !skipCommit.current) void commit();
        skipCommit.current = false;
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 max-w-64 items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-sm text-ink transition-colors duration-(--dur-fast) hover:bg-hover-wash"
        >
          {icon ? <span className="text-[13px] leading-none">{icon}</span> : null}
          <span className="truncate">{name || t("tree.untitled")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="flex w-80 flex-row items-center gap-1.5 p-1.5">
        <IconPickerPopover icon={icon} onPick={setIcon} onRemove={() => setIcon(null)}>
          <button
            type="button"
            aria-label={t("page.changeIcon")}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-input text-base transition-colors duration-(--dur-fast) hover:bg-hover-wash"
          >
            {icon ?? <Smile size={16} className="text-ink-faint" />}
          </button>
        </IconPickerPopover>
        <Input
          autoFocus
          value={draft}
          placeholder={t("tree.untitled")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              skipCommit.current = true;
              setOpen(false);
              void commit();
            }
            if (e.key === "Escape") {
              skipCommit.current = true;
              setOpen(false);
            }
          }}
          className="h-8"
        />
      </PopoverContent>
    </Popover>
  );
}

/** Notion-style breadcrumb for the open note, rooted at the active vault. */
export function Breadcrumb() {
  const vault = useVaultsStore((s) => activeVault(s));
  const openPath = useNavStore((s) => s.openPath);

  if (!vault || !openPath || !openPath.startsWith(`${vault.path}/`)) return null;

  const parts = openPath.slice(vault.path.length + 1).split("/");
  let ancestors = parts.slice(0, -1).map((name, i) => ({
    name,
    dirPath: `${vault.path}/${parts.slice(0, i + 1).join("/")}`,
  }));
  // Deep paths collapse the middle, keeping the first and nearest ancestor.
  const collapsed = ancestors.length > 3;
  if (collapsed) ancestors = [ancestors[0], ancestors[ancestors.length - 1]];

  return (
    <nav className="flex min-w-0 items-center">
      {ancestors.map((a, i) => (
        <Fragment key={a.dirPath}>
          {collapsed && i === 1 ? (
            <>
              <span className="px-0.5 text-ink-faint">/</span>
              <span className="px-1 text-sm text-ink-faint">…</span>
            </>
          ) : null}
          <AncestorCrumb dirPath={a.dirPath} name={a.name} />
          <span className="px-0.5 text-ink-faint">/</span>
        </Fragment>
      ))}
      <CurrentCrumb path={openPath} />
    </nav>
  );
}
