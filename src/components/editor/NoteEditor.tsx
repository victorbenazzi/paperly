import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, FileWarning, FolderOpen, Smile } from "lucide-react";
import { useCreateBlockNote } from "@blocknote/react";
import { en, pt } from "@blocknote/core/locales";
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
import {
  extractCompatibleTitle,
  restoreCompatibleTitle,
  type TitleProjection,
} from "@/features/editor/markdown/titleProjection";
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
import { paperlySchema } from "@/components/editor/RawMarkdownBlock";
import { Button } from "@/components/ui/button";
import { CMD, errorMessage, ipc } from "@/lib/ipc";

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(name), [name]);
  useEffect(() => {
    if (!useNavStore.getState().consumeFocus(path, "title")) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [path]);

  const commit = async (): Promise<string> => {
    const next = draft.trim();
    if (!next || next === name) {
      setDraft(name);
      return path;
    }
    try {
      return await renamePage(path, next);
    } catch (err) {
      console.error("title rename failed:", errorMessage(err));
      setDraft(name);
      return path;
    }
  };

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void (async () => {
            const finalPath = await commit();
            useNavStore.getState().requestFocus(finalPath, "editor");
            onSubmit?.();
          })();
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
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language).toLowerCase();
  const effective = useThemeStore((s) => s.effective);
  const vault = useVaultsStore((s) => activeVault(s));
  const openNote = useNavStore((s) => s.open);
  const select = useTreeStore((s) => s.select);
  const editor = useCreateBlockNote(
    {
      schema: paperlySchema,
      dictionary: language.startsWith("pt") ? pt : en,
      uploadFile: vault ? (file: File) => uploadAssetToVault(vault.id, file) : undefined,
      resolveFileUrl: vault
        ? (url: string) => resolveVaultFileUrl(vault.path, url)
        : undefined,
      // Notion-style page links: emoji (or default glyph) + soft underline.
      extensions: vault ? [internalLinkDecorations(vault.path)] : undefined,
    },
    [vault?.id, language],
  );
  const [readyEditor, setReadyEditor] = useState<typeof editor | null>(null);
  const ready = readyEditor === editor;
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);
  const titleProjection = useRef<TitleProjection | null>(null);
  const readOnlyInfo = useEditorStore((s) => s.readOnlyInfo);

  useEffect(() => {
    let cancelled = false;
    let openedSessionId: number | null = null;
    void (async () => {
      const loaded = await useEditorStore.getState().load(path);
      if (cancelled) return;
      if (!loaded.ok) {
        if (loaded.reason !== "staleSession") setLoadError(loaded.message);
        return;
      }
      openedSessionId = loaded.sessionId;
      if (loaded.mode === "readOnly") {
        setReadyEditor(editor);
        return;
      }
      const vaultPath = vault?.path;
      const fileTitle = stripMdExt(path.split("/").pop() ?? "");
      const extracted = extractCompatibleTitle(loaded.body, fileTitle);
      titleProjection.current = extracted.projection;
      // The index must be ready BEFORE the first parse, or every [[link]]
      // in the note would fail to resolve.
      if (vault) await ensureWikiIndex(vault.id);
      const blocks = await codec.markdownToBlocks(editor, extracted.body, vaultPath);
      if (cancelled) return;
      editor.replaceBlocks(editor.document, blocks);
      // Register the serializer only AFTER the initial content lands, so the
      // replaceBlocks onChange can never write a normalized doc on open.
      useEditorStore
        .getState()
        .registerSerializer(loaded.sessionId, async () => {
          const body = await codec.blocksToMarkdown(editor, vaultPath);
          const currentPath = useEditorStore.getState().path ?? path;
          const currentTitle = stripMdExt(currentPath.split("/").pop() ?? "");
          return restoreCompatibleTitle(body, currentTitle, titleProjection.current);
        });
      useEditorStore.getState().registerReloader(loaded.sessionId, async (newBody: string) => {
        const currentPath = useEditorStore.getState().path ?? path;
        const currentTitle = stripMdExt(currentPath.split("/").pop() ?? "");
        const next = extractCompatibleTitle(newBody, currentTitle);
        titleProjection.current = next.projection;
        const newBlocks = await codec.markdownToBlocks(editor, next.body, vaultPath);
        editor.replaceBlocks(editor.document, newBlocks);
      });
      useOutlineStore.getState().set(collectHeadings(editor.document));
      loadedFor.current = path;
      setReadyEditor(editor);
      if (useNavStore.getState().consumeFocus(path, "editor")) {
        requestAnimationFrame(() => editor.focus());
      }
    })();
    return () => {
      cancelled = true;
      useOutlineStore.getState().clear();
      if (openedSessionId !== null) void useEditorStore.getState().close(openedSessionId);
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
      void openNote(resolved).then((opened) => {
        if (opened) select(resolved);
      });
    }
  };

  if (loadError) {
    return (
      <p className="mx-auto max-w-3xl px-12 py-10 text-sm text-danger">
        {t("errors.generic", { message: loadError })}
      </p>
    );
  }

  if (readOnlyInfo) {
    const size = new Intl.NumberFormat(undefined, {
      style: "unit",
      unit: "megabyte",
      maximumFractionDigits: 1,
    }).format(readOnlyInfo.size / 1_000_000);
    return (
      <div className="mx-auto flex h-full max-w-3xl flex-col px-12 py-10">
        <PageHeader path={path} />
        <div className="mt-4 border-t border-hairline pt-6">
          <div className="flex items-start gap-3 text-sm">
            <FileWarning size={18} className="mt-0.5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{t("editor.readOnlyTitle")}</p>
              <p className="mt-1 text-ink-muted">
                {t(
                  readOnlyInfo.reason === "truncated"
                    ? "editor.readOnlyTruncated"
                    : "editor.readOnlyEncoding",
                  { size, encoding: readOnlyInfo.encoding },
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void ipc(CMD.openWithDefaultApp, { path })}
                >
                  <ExternalLink size={14} />
                  {t("editor.openExternally")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void ipc(CMD.revealInFinder, { path })}
                >
                  <FolderOpen size={14} />
                  {t("tree.reveal")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-3xl px-12 py-10">
      <PageHeader path={path} onTitleSubmit={() => editor.focus()} />
      {/* onClick handles in-vault note links; keyboard nav stays BlockNote's. */}
      <div
        className={ready ? "" : "invisible"}
        aria-busy={!ready}
        data-editor-language={ready ? (language.startsWith("pt") ? "pt" : "en") : undefined}
        onClick={handleEditorClick}
      >
        <BlockNoteView
          editor={editor}
          theme={effective}
          formattingToolbar={false}
          sideMenu={false}
          onChange={() => {
            useOutlineStore.getState().set(collectHeadings(editor.document));
            if (loadedFor.current === path) {
              useEditorStore.getState().scheduleSave(useEditorStore.getState().sessionId);
            }
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
