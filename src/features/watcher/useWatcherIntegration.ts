import { useEffect } from "react";

import { EV, type FsChangedPayload } from "@/lib/events";
import { listenAppEvent } from "@/lib/appEvents";
import { CMD, ipc } from "@/lib/ipc";
import { useTreeStore } from "@/features/tree/tree.store";
import { usePageMetaStore } from "@/features/pages/pageMeta.store";
import { useEditorStore } from "@/features/editor/editor.store";
import { useExternalEditStore } from "@/features/editor/externalEdit.store";
import { useVaultsStore } from "@/features/vaults/vaults.store";
import { refreshWikiIndex } from "@/features/editor/markdown/wikiLinks";
import { isMarkdown } from "@/features/tree/tree.types";
import { invalidateFileUrls } from "@/features/assets/assets";

/**
 * Wires the Rust watcher's `fs://changed` events into the frontend:
 * 1. Invalidates tree dir caches so the sidebar refreshes.
 * 2. Refreshes the wiki-link index when notes appear/move/disappear.
 * 3. Detects external edits on the open note and raises reload/conflict.
 * 4. Starts/stops the watcher when the active vault changes.
 */
export function useWatcherIntegration(vaultId: string | null) {
  const activeVault = useVaultsStore((s) =>
    s.vaults.find((v) => v.id === s.activeVaultId) ?? null,
  );

  useEffect(() => {
    if (!vaultId || !activeVault) return;
    void ipc(CMD.watcherWatch, { vaultId, path: activeVault.path }).catch(() => {});
    return () => {
      void ipc(CMD.watcherUnwatch, { vaultId }).catch(() => {});
    };
  }, [vaultId, activeVault]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    void listenAppEvent<FsChangedPayload>(EV.fsChanged, (payload) => {
      const { vaultId: eventVaultId, paths } = payload;
      if (eventVaultId !== vaultId) return;

      useTreeStore.getState().handleFsChange(paths);
      usePageMetaStore.getState().handleFsChange(paths);
      if (paths.some((p) => isMarkdown(p.split("/").pop() ?? ""))) {
        refreshWikiIndex(eventVaultId);
      }
      invalidateFileUrls(paths);

      const editorState = useEditorStore.getState();
      const openPath = editorState.path;
      if (!openPath || !paths.includes(openPath)) return;

      void (async () => {
        try {
          const file = await ipc<{ content: string }>(CMD.readFileText, { path: openPath });
          const current = useEditorStore.getState();
          if (current.path !== openPath) return;
          if (file.content === current.lastSavedContent) return;

          const isDirty =
            current.status === "dirty" ||
            current.status === "saving" ||
            current.status === "error";
          useExternalEditStore.getState().setEdit({
            kind: isDirty ? "conflict" : "reload",
            path: openPath,
            diskContent: file.content,
          });
        } catch {
          // file may have been deleted; ignore
        }
      })();
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((err) => console.error("watcher event listener failed:", err));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [vaultId]);
}
