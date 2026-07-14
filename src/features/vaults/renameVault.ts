import { useEditorStore } from "@/features/editor/editor.store";
import { useTreeStore } from "@/features/tree/tree.store";
import { remapPagePaths } from "@/features/pages/pagePaths";
import { refreshWikiIndex } from "@/features/editor/markdown/wikiLinks";

import { useVaultsStore } from "./vaults.store";
import { remapWorkspaceFile } from "./workspace.persist";

/**
 * Rename a vault from the switcher. The backend renames the folder on disk,
 * so everything holding absolute paths under the old root must be re-pointed:
 * tree state, nav history, the editor's write target and the wiki index for
 * the active vault; the persisted workspace file for inactive ones. The
 * watcher re-watches by itself (its effect depends on the vault object).
 */
export async function renameVault(id: string, name: string): Promise<void> {
  const { vaults, activeVaultId } = useVaultsStore.getState();
  const before = vaults.find((v) => v.id === id);
  if (!before) return;

  // Flush content before the path changes under the editor.
  if (id === activeVaultId) {
    const saved = await useEditorStore.getState().saveNow();
    if (!saved.ok && saved.reason !== "readOnly") throw new Error(saved.message);
  }

  const after = await useVaultsStore.getState().rename(id, name);
  if (after.path === before.path) return;

  if (id === activeVaultId) {
    // Tree first: nav remap persists immediately and snapshots tree state.
    useTreeStore.getState().remapRoot(before.path, after.path);
    remapPagePaths(before.path, after.path);
    refreshWikiIndex(id);
  } else {
    await remapWorkspaceFile(id, before.path, after.path);
  }
}
