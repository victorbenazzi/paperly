import { useEffect, useRef } from "react";

import { CMD, ipc } from "@/lib/ipc";
import { useTreeStore } from "@/features/tree/tree.store";
import { useNavStore } from "@/features/nav/nav.store";
import { usePageMetaStore } from "@/features/pages/pageMeta.store";

interface WorkspaceState {
  expanded: string[];
  openPath: string | null;
  /** Manual sibling order per dir (drag-reorder), display names. */
  treeOrder?: Record<string, string[]>;
}

const SAVE_DEBOUNCE_MS = 500;

/**
 * A vault folder rename moved every absolute path persisted for it. For the
 * ACTIVE vault the live stores are remapped and the save subscription rewrites
 * the file; this handles INACTIVE vaults, whose state only exists on disk.
 */
export async function remapWorkspaceFile(
  vaultId: string,
  from: string,
  to: string,
): Promise<void> {
  const remap = (p: string) =>
    p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p;
  const state = await ipc<WorkspaceState | null>(CMD.loadWorkspaceState, { vaultId }).catch(
    () => null,
  );
  if (!state) return;
  const next: WorkspaceState = {
    expanded: Array.isArray(state.expanded) ? state.expanded.map(remap) : [],
    openPath: typeof state.openPath === "string" ? remap(state.openPath) : null,
    treeOrder:
      state.treeOrder && typeof state.treeOrder === "object"
        ? Object.fromEntries(Object.entries(state.treeOrder).map(([dir, names]) => [remap(dir), names]))
        : undefined,
  };
  await ipc(CMD.saveWorkspaceState, { vaultId, state: next }).catch(() => {});
}

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
    void ipc<WorkspaceState | null>(CMD.loadWorkspaceState, { vaultId })
      // A failed read must still mark the vault hydrated, or the save guard
      // below would silently block persistence for the whole session.
      .catch(() => null)
      .then((state) => {
        if (cancelled) return;
        // The restore races user input: this IPC resolves amid the startup
        // burst (watcher, dir listings, icon reads), and the user may have
        // already clicked a note or expanded folders. Persisted state only
        // fills in what the user hasn't touched; it never overrides them.
        if (state) {
          if (state.treeOrder && typeof state.treeOrder === "object") {
            // The file is hand-editable; a malformed value here would throw
            // inside buildNodes and take the whole sidebar down.
            const persisted = Object.fromEntries(
              Object.entries(state.treeOrder).filter(
                ([, names]) => Array.isArray(names) && names.every((n) => typeof n === "string"),
              ),
            );
            const current = useTreeStore.getState().order;
            useTreeStore.getState().setOrderMap({ ...persisted, ...current });
          }
          if (Array.isArray(state.expanded) && !useTreeStore.getState().expandedTouched) {
            useTreeStore.getState().setExpanded(state.expanded);
          }
          if (typeof state.openPath === "string" && state.openPath) {
            const untouched =
              useNavStore.getState().openPath === null &&
              useTreeStore.getState().selectedPath === null;
            if (untouched) {
              useNavStore.getState().open(state.openPath);
              useTreeStore.getState().select(state.openPath);
            }
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

    const write = () => {
      const state: WorkspaceState = {
        expanded: [...useTreeStore.getState().expanded],
        openPath: useNavStore.getState().openPath,
        treeOrder: useTreeStore.getState().order,
      };
      void ipc(CMD.saveWorkspaceState, { vaultId, state }).catch(() => {});
    };
    // Guard: never clobber persisted state with the empty post-reset state
    // before hydration finishes.
    const schedule = () => {
      if (hydratedFor.current !== vaultId) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(write, SAVE_DEBOUNCE_MS);
    };
    // Navigation persists immediately (it is one write per click, and a dev
    // full-reload can kill the webview before a debounced save ever fires;
    // the restored session must reopen the page the user was actually on).
    const persistNow = () => {
      if (hydratedFor.current !== vaultId) return;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      write();
    };

    const unsubTree = useTreeStore.subscribe((s, prev) => {
      if (s.expanded !== prev.expanded || s.order !== prev.order) schedule();
    });
    const unsubNav = useNavStore.subscribe((s, prev) => {
      if (s.openPath !== prev.openPath) persistNow();
    });
    return () => {
      unsubTree();
      unsubNav();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [vaultId]);
}
