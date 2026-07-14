import { useEditorStore } from "@/features/editor/editor.store";
import { useNavStore } from "@/features/nav/nav.store";
import { usePageMetaStore } from "./pageMeta.store";

/**
 * A path (or a whole dir subtree) moved on disk via rename/move. Re-point
 * everything that holds absolute paths to open pages: nav history, the icon
 * cache and, crucially, the editor's write target, so a pending autosave can
 * never resurrect the file at its old location.
 */
export function remapPagePaths(from: string, to: string): void {
  useNavStore.getState().remap(from, to);
  usePageMetaStore.getState().remap(from, to);
  const editor = useEditorStore.getState();
  if (!editor.path) return;
  const next =
    editor.path === from
      ? to
      : editor.path.startsWith(`${from}/`)
        ? to + editor.path.slice(from.length)
        : editor.path;
  if (next !== editor.path) editor.remap(next);
}

/**
 * Close only paths the backend confirmed were moved to the Trash. The caller
 * has already flushed the current document before invoking the backend.
 */
export function closeDeletedPaths(deletedPaths: string[]): void {
  const within = (p: string) =>
    deletedPaths.some((deleted) => p === deleted || p.startsWith(`${deleted}/`));
  const editor = useEditorStore.getState();
  if (editor.path && within(editor.path)) editor.discard();
  const nav = useNavStore.getState();
  if (nav.openPath && within(nav.openPath)) nav.close();
}
