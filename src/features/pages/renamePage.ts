import { useEditorStore } from "@/features/editor/editor.store";
import { useNavStore } from "@/features/nav/nav.store";
import { useTreeStore } from "@/features/tree/tree.store";
import { stripMdExt } from "@/features/tree/tree.types";
import { usePageMetaStore } from "./pageMeta.store";

/**
 * Rename an open page from the title or the breadcrumb. Handles the
 * folder-note companion dir, then re-points nav history, the icon cache and
 * the tree selection at the new path. Returns the new .md path.
 */
export async function renamePage(path: string, nextName: string): Promise<string> {
  // Flush content before the path changes under the editor.
  await useEditorStore.getState().saveNow();

  const name = stripMdExt(path.split("/").pop() ?? "");
  const dir = path.slice(0, path.lastIndexOf("/"));
  const entries = useTreeStore.getState().dirCache[dir] ?? [];
  const dirEntry = entries.find((e) => e.isDir && e.name === name);
  const companion = dirEntry ? `${dir}/${name}` : null;

  const newPath = await useTreeStore.getState().renameNode(path, companion, nextName);

  useNavStore.getState().remap(path, newPath);
  usePageMetaStore.getState().remap(path, newPath);
  if (companion) {
    const newDir = newPath.replace(/\.(md|markdown)$/i, "");
    useNavStore.getState().remap(companion, newDir);
    usePageMetaStore.getState().remap(companion, newDir);
  }
  useTreeStore.getState().select(newPath);
  return newPath;
}
