import { useTranslation } from "react-i18next";

import { useTreeStore } from "./tree.store";
import { useNavStore } from "@/features/nav/nav.store";
import { useVaultsStore, activeVault } from "@/features/vaults/vaults.store";

/**
 * "New page" / "new folder" at the vault root, shared by the Sidebar buttons
 * and the FileTree background context menu so the two never drift.
 */
export function useRootActions() {
  const { t } = useTranslation();
  const vault = useVaultsStore((s) => activeVault(s));
  const createNote = useTreeStore((s) => s.createNote);
  const createFolder = useTreeStore((s) => s.createFolder);
  const openNote = useNavStore((s) => s.open);

  const revealForRename = (path: string) => {
    const tree = useTreeStore.getState();
    if (vault && !tree.expanded.has(vault.path)) tree.toggleExpanded(vault.path);
    tree.select(path);
    tree.startRename(path);
  };

  const newPageAtRoot = async () => {
    if (!vault) return;
    const path = await createNote(vault.path, t("tree.untitled"));
    openNote(path);
    revealForRename(path);
  };

  const newFolderAtRoot = async () => {
    if (!vault) return;
    const path = await createFolder(vault.path, t("tree.untitledFolder"));
    revealForRename(path);
  };

  return { newPageAtRoot, newFolderAtRoot };
}
