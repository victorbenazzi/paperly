import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Smile } from "lucide-react";
import { useCreateBlockNote } from "@blocknote/react";
import {
  FormattingToolbar,
  FormattingToolbarController,
  BlockTypeSelect,
  BasicTextStyleButton,
  CreateLinkButton,
  NestBlockButton,
  UnnestBlockButton,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import "./blocknote-theme.css";

import { useThemeStore } from "@/features/theme/theme.store";
import { useEditorStore } from "@/features/editor/editor.store";
import { codec } from "@/features/editor/markdown/codec";
import { ensureWikiIndex, resolveWikiLink } from "@/features/editor/markdown/wikiLinks";
import { useTreeStore } from "@/features/tree/tree.store";
import { useNavStore } from "@/features/nav/nav.store";
import { useVaultsStore, activeVault } from "@/features/vaults/vaults.store";
import { uploadAssetToVault, resolveVaultFileUrl } from "@/features/assets/assets";
import { stripMdExt, isMarkdown } from "@/features/tree/tree.types";
import { renamePage } from "@/features/pages/renamePage";
import { internalLinkDecorations } from "@/components/editor/internalLinks";
import { useOutlineStore, type OutlineHeading } from "@/features/outline/outline.store";
import { IconPickerPopover } from "@/components/page/EmojiPicker";
import { EditorSideMenu } from "@/components/editor/EditorSideMenu";
import { errorMessage } from "@/lib/ipc";

function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      const item = c as { type?: string; text?: string; content?: unknown };
      if (item.type === "link") return inlineText(item.content);
      return typeof item.text === "string" ? item.text : "";
    })
    .join("");
}

function collectHeadings(blocks: unknown[]): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  const walk = (bs: unknown[]) => {
    for (const b of bs) {
      const block = b as {
        id: string;
        type?: string;
        props?: { level?: number };
        content?: unknown;
        children?: unknown[];
      };
      if (block.type === "heading") {
        out.push({
          id: block.id,
          text: inlineText(block.content).trim(),
          level: block.props?.level ?? 1,
        });
      }
      if (Array.isArray(block.children) && block.children.length > 0) walk(block.children);
    }
  };
  walk(blocks);
  return out;
}

function NoteTitle({ path, onSubmit }: { path: string; onSubmit?: () => void }) {
  const { t } = useTranslation();
  const name = stripMdExt(path.split("/").pop() ?? "");
  const [draft, setDraft] = useState(name);

  useEffect(() => setDraft(name), [name]);

  const commit = async () => {
    const next = draft.trim();
    if (!next || next === name) {
      setDraft(name);
      return;
    }
    try {
      await renamePage(path, next);
    } catch (err) {
      console.error("title rename failed:", errorMessage(err));
      setDraft(name);
    }
  };

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
          onSubmit?.();
        }
        if (e.key === "Escape") {
          setDraft(name);
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={t("tree.untitled")}
      className="allow-select w-full bg-transparent text-[2.2rem] font-bold leading-tight tracking-[-0.02em] text-ink outline-none placeholder:text-ink-faint"
    />
  );
}

/**
 * Notion-style page header: big emoji icon when set, otherwise an "add icon"
 * action that fades in on hover above the title. The icon lives in the note's
 * frontmatter and is mirrored to the tree via the page-meta cache.
 */
function PageHeader({ path, onTitleSubmit }: { path: string; onTitleSubmit?: () => void }) {
  const { t } = useTranslation();
  const icon = useEditorStore((s) => (typeof s.meta.icon === "string" ? s.meta.icon : null));
  const setIcon = useEditorStore((s) => s.setIcon);

  return (
    <div className="group/page mb-4">
      {icon ? (
        <IconPickerPopover icon={icon} onPick={setIcon} onRemove={() => setIcon(null)}>
          <button
            type="button"
            aria-label={t("page.changeIcon")}
            className="-ml-1.5 mb-3 rounded-lg px-1.5 py-1 transition-colors duration-(--dur-fast) hover:bg-hover-wash"
          >
            <span className="block text-[64px] leading-[1.1]">{icon}</span>
          </button>
        </IconPickerPopover>
      ) : (
        // Reserved row above the title; visible on hover (or while picking),
        // so the layout never shifts.
        <div className="flex h-8 items-center opacity-0 transition-opacity duration-(--dur-fast) group-hover/page:opacity-100 has-[[data-state=open]]:opacity-100">
          <IconPickerPopover icon={null} onPick={setIcon} onRemove={() => {}}>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-sm text-ink-faint transition-colors duration-(--dur-fast) hover:bg-hover-wash hover:text-ink-muted"
            >
              <Smile size={15} />
              {t("page.addIcon")}
            </button>
          </IconPickerPopover>
        </div>
      )}
      <NoteTitle path={path} onSubmit={onTitleSubmit} />
    </div>
  );
}

/**
 * One BlockNote instance per note: the parent keys this component by path,
 * so switching notes tears down and rebuilds the editor (never reuse an
 * instance across files).
 */
export function NoteEditor({ path }: { path: string }) {
  const { t } = useTranslation();
  const effective = useThemeStore((s) => s.effective);
  const vault = useVaultsStore((s) => activeVault(s));
  const openNote = useNavStore((s) => s.open);
  const select = useTreeStore((s) => s.select);
  const editor = useCreateBlockNote(
    {
      uploadFile: vault ? (file: File) => uploadAssetToVault(vault.id, file) : undefined,
      resolveFileUrl: vault
        ? (url: string) => resolveVaultFileUrl(vault.path, url)
        : undefined,
      // Notion-style page links: emoji (or default glyph) + soft underline.
      extensions: vault ? [internalLinkDecorations(vault.path)] : undefined,
    },
    [vault?.id],
  );
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const body = await useEditorStore.getState().load(path);
      if (cancelled) return;
      if (body === null) {
        setLoadError(useEditorStore.getState().error);
        return;
      }
      const vp = vault?.path;
      // The index must be ready BEFORE the first parse, or every [[link]]
      // in the note would fail to resolve.
      if (vault) await ensureWikiIndex(vault.id);
      const blocks = await codec.markdownToBlocks(editor, body, vp);
      if (cancelled) return;
      editor.replaceBlocks(editor.document, blocks);
      // Register the serializer only AFTER the initial content lands, so the
      // replaceBlocks onChange can never write a normalized doc on open.
      useEditorStore.getState().registerSerializer(() => codec.blocksToMarkdown(editor, vp));
      useEditorStore.getState().registerReloader(async (newBody) => {
        const newBlocks = await codec.markdownToBlocks(editor, newBody, vp);
        editor.replaceBlocks(editor.document, newBlocks);
      });
      useOutlineStore.getState().set(collectHeadings(editor.document));
      loadedFor.current = path;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      useOutlineStore.getState().clear();
      void useEditorStore.getState().close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, path]);

  // Internal note links: BlockNote renders plain anchors; .md hrefs are
  // vault-relative (see wikiLinks.ts). Scoped to the editor container so
  // anchors elsewhere in the app are never intercepted.
  const handleEditorClick = (e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    const raw = anchor.getAttribute("href");
    if (!raw || raw === "#") return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return; // http(s), mailto... not ours
    e.preventDefault();
    let href = raw;
    try {
      href = decodeURI(raw);
    } catch {
      // malformed encoding; use as-is
    }
    const abs = href.startsWith("/") ? href : vault ? `${vault.path}/${href}` : null;
    if (!abs) return;
    const resolved = isMarkdown(abs.split("/").pop() ?? "")
      ? abs
      : resolveWikiLink(stripMdExt(href.split("/").pop() ?? href));
    if (resolved) {
      openNote(resolved);
      select(resolved);
    }
  };

  if (loadError) {
    return (
      <p className="mx-auto max-w-3xl px-12 py-10 text-sm text-danger">
        {t("errors.generic", { message: loadError })}
      </p>
    );
  }

  return (
    <div className="mx-auto h-full max-w-3xl px-12 py-10">
      <PageHeader path={path} onTitleSubmit={() => editor.focus()} />
      {/* onClick handles in-vault note links; keyboard nav stays BlockNote's. */}
      <div className={ready ? "" : "invisible"} onClick={handleEditorClick}>
        <BlockNoteView
          editor={editor}
          theme={effective}
          formattingToolbar={false}
          sideMenu={false}
          onChange={() => {
            useOutlineStore.getState().set(collectHeadings(editor.document));
            if (loadedFor.current === path) useEditorStore.getState().scheduleSave();
          }}
        >
          <FormattingToolbarController
            formattingToolbar={() => (
              <FormattingToolbar>
                <BlockTypeSelect key="blockTypeSelect" />
                <BasicTextStyleButton basicTextStyle="bold" key="bold" />
                <BasicTextStyleButton basicTextStyle="italic" key="italic" />
                <BasicTextStyleButton basicTextStyle="strike" key="strike" />
                <BasicTextStyleButton basicTextStyle="code" key="code" />
                <CreateLinkButton key="link" />
                <NestBlockButton key="nest" />
                <UnnestBlockButton key="unnest" />
              </FormattingToolbar>
            )}
          />
          <EditorSideMenu />
        </BlockNoteView>
      </div>
    </div>
  );
}
