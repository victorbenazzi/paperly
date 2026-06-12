import { useEffect, useRef } from "react";

import { CMD, ipc } from "@/lib/ipc";
import { useTreeStore } from "@/features/tree/tree.store";
import { useNavStore } from "@/features/nav/nav.store";
import { usePageMetaStore } from "@/features/pages/pageMeta.store";

interface WorkspaceState {
  expanded: string[];
  openPath: string | null;
}

const SAVE_DEBOUNCE_MS = 500;

/**
 * Per-vault UI state round-trip. On vault switch: reset tree + nav, then
 * restore the persisted expansion + open note. Saves debounced on change.
 */
export function useWorkspacePersistence(vaultId: string | null) {
  const hydratedFor = useRef<string | null>(null);

  // Restore on vault switch.
  useEffect(() => {
    useTreeStore.getState().reset();
    useNavStore.getState().close();
    usePageMetaStore.getState().reset();
    hydratedFor.current = null;
    if (!vaultId) return;

    let cancelled = false;
    void ipc<WorkspaceState | null>(CMD.loadWorkspaceState, { vaultId }).then((state) => {
      if (cancelled) return;
      if (state) {
        if (Array.isArray(state.expanded)) {
          useTreeStore.getState().setExpanded(state.expanded);
        }
        if (typeof state.openPath === "string" && state.openPath) {
          useNavStore.getState().open(state.openPath);
          useTreeStore.getState().select(state.openPath);
        }
      }
      hydratedFor.current = vaultId;
    });
    return () => {
      cancelled = true;
    };
  }, [vaultId]);

  // Save (debounced) whenever expansion or the open note changes.
  useEffect(() => {
    if (!vaultId) return;
    let timer: number | null = null;

    const schedule = () => {
      // Guard: never clobber persisted state with the empty post-reset state
      // before hydration finishes.
      if (hydratedFor.current !== vaultId) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const state: WorkspaceState = {
          expanded: [...useTreeStore.getState().expanded],
          openPath: useNavStore.getState().openPath,
        };
        void ipc(CMD.saveWorkspaceState, { vaultId, state }).catch(() => {});
      }, SAVE_DEBOUNCE_MS);
    };

    const unsubTree = useTreeStore.subscribe((s, prev) => {
      if (s.expanded !== prev.expanded) schedule();
    });
    const unsubNav = useNavStore.subscribe((s, prev) => {
      if (s.openPath !== prev.openPath) schedule();
    });
    return () => {
      unsubTree();
      unsubNav();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [vaultId]);
}
