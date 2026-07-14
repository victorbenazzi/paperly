import { useEditorStore } from "@/features/editor/editor.store";
import { useTreeStore } from "@/features/tree/tree.store";
import { stripMdExt } from "@/features/tree/tree.types";
import { renameCompatibleTitleInFile } from "@/features/editor/markdown/titleProjection";
import i18n from "@/features/i18n/config";
import { CMD, errorMessage, ipc, type TextFile } from "@/lib/ipc";
import { remapPagePaths } from "./pagePaths";

async function prepareClosedPageTitle(
  path: string,
  previousTitle: string,
  nextTitle: string,
): Promise<string | null> {
  const file = await ipc<TextFile>(CMD.readFileText, { path });
  if (file.truncated || file.encoding.toLowerCase() !== "utf-8") return null;
  const updated = renameCompatibleTitleInFile(file.content, previousTitle, nextTitle);
  if (updated === file.content) return null;
  await ipc(CMD.writeFileText, { path, content: updated });
  return file.content;
}

/**
 * Rename an open page from the title or the breadcrumb. Handles the
 * folder-note companion dir, then re-points nav history, the icon cache and
 * the tree selection at the new path. Returns the new .md path.
 */
export async function renamePage(path: string, nextName: string): Promise<string> {
  // Flush content before the path changes under the editor.
  const editor = useEditorStore.getState();
  const openSessionId = editor.sessionId;
  const renamingOpenPage = editor.path === path;
  const saved = await editor.saveNow(openSessionId);
  if (!saved.ok && saved.reason !== "readOnly") throw new Error(saved.message);

  const name = stripMdExt(path.split("/").pop() ?? "");
  const dir = path.slice(0, path.lastIndexOf("/"));
  const companion = `${dir}/${name}`;
  const originalClosedContent = renamingOpenPage
    ? null
    : await prepareClosedPageTitle(path, name, nextName);

  let newPath: string;
  try {
    newPath = await useTreeStore.getState().renameNode(path, companion, nextName);
  } catch (renameError) {
    if (originalClosedContent !== null) {
      try {
        await ipc(CMD.writeFileText, { path, content: originalClosedContent });
      } catch (rollbackError) {
        throw new Error(
          i18n.t("editor.errors.renameRollback", {
            save: errorMessage(renameError),
            rollback: errorMessage(rollbackError),
          }),
        );
      }
    }
    throw renameError;
  }

  remapPagePaths(path, newPath);
  const newCompanion = stripMdExt(newPath);
  remapPagePaths(companion, newCompanion);
  useTreeStore.getState().select(newPath);
  if (renamingOpenPage) {
    const titleSaved = await useEditorStore.getState().forceSave(openSessionId);
    if (!titleSaved.ok && titleSaved.reason !== "readOnly") {
      try {
        const restoredPath = await useTreeStore
          .getState()
          .renameNode(newPath, newCompanion, name);
        remapPagePaths(newPath, restoredPath);
        remapPagePaths(newCompanion, companion);
        useTreeStore.getState().select(restoredPath);
      } catch (rollbackError) {
        throw new Error(
          i18n.t("editor.errors.renameRollback", {
            save: titleSaved.message,
            rollback: errorMessage(rollbackError),
          }),
        );
      }
      throw new Error(titleSaved.message);
    }
  }
  return newPath;
}
