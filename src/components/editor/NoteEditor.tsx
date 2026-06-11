import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useTreeStore } from "@/features/tree/tree.store";
import { useNavStore } from "@/features/nav/nav.store";
import { useVaultsStore, activeVault } from "@/features/vaults/vaults.store";
import { uploadAssetToVault, resolveVaultFileUrl } from "@/features/assets/assets";
import { stripMdExt, isMarkdown } from "@/features/tree/tree.types";
import { errorMessage } from "@/lib/ipc";

function NoteTitle({ path }: { path: string }) {
  const { t } = useTranslation();
  const name = stripMdExt(path.split("/").pop() ?? "");
  const [draft, setDraft] = useState(name);
  const renameNode = useTreeStore((s) => s.renameNode);
  const remapNav = useNavStore((s) => s.remap);

  useEffect(() => setDraft(name), [name]);

  const commit = async () => {
    const next = draft.trim();
    if (!next || next === name) {
      setDraft(name);
      return;
    }
    try {
      // Flush content before the path changes under the editor.
      await useEditorStore.getState().saveNow();
      const dir = path.slice(0, path.lastIndexOf("/"));
      const companion = `${dir}/${name}`;
      const hasCompanion = isMarkdown(path) ? companion : null;
      // renameNode handles the folder-note pair when dirPath is passed; we
      // detect the companion folder from the tree cache.
      const entries = useTreeStore.getState().dirCache[dir] ?? [];
      const dirEntry = entries.find((e) => e.isDir && e.name === name);
      const newPath = await renameNode(path, dirEntry ? (hasCompanion ?? null) : null, next);
      remapNav(path, newPath);
      useTreeStore.getState().select(newPath);
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
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
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
 * One BlockNote instance per note: the parent keys this component by path,
 * so switching notes tears down and rebuilds the editor (never reuse an
 * instance across files).
 */
export function NoteEditor({ path }: { path: string }) {
  const { t } = useTranslation();
  const effective = useThemeStore((s) => s.effective);
  const vault = useVaultsStore((s) => activeVault(s));
  const editor = useCreateBlockNote(
    {
      // Pasted/dropped files land in <vault>/assets/; the block keeps the
      // vault-relative path (what the markdown stores), and resolveFileUrl
      // turns it into a displayable object URL at render time.
      uploadFile: vault ? (file: File) => uploadAssetToVault(vault.id, file) : undefined,
      resolveFileUrl: vault
        ? (url: string) => resolveVaultFileUrl(vault.path, url)
        : undefined,
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
      const blocks = await codec.markdownToBlocks(editor, body);
      if (cancelled) return;
      editor.replaceBlocks(editor.document, blocks);
      // Register the serializer only AFTER the initial content lands, so the
      // replaceBlocks onChange can never write a normalized doc on open.
      useEditorStore.getState().registerSerializer(() => codec.blocksToMarkdown(editor));
      loadedFor.current = path;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      void useEditorStore.getState().close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, path]);

  if (loadError) {
    return (
      <p className="mx-auto max-w-3xl px-12 py-10 text-sm text-danger">
        {t("errors.generic", { message: loadError })}
      </p>
    );
  }

  return (
    <div className="mx-auto h-full max-w-3xl px-12 py-10">
      <div className="mb-4">
        <NoteTitle path={path} />
      </div>
      <div className={ready ? "" : "invisible"}>
        <BlockNoteView
          editor={editor}
          theme={effective}
          formattingToolbar={false}
          onChange={() => {
            if (loadedFor.current === path) useEditorStore.getState().scheduleSave();
          }}
        >
          {/* Custom toolbar: everything except colors and alignment, which
              markdown cannot represent and noteflow therefore doesn't offer. */}
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
        </BlockNoteView>
      </div>
    </div>
  );
}
