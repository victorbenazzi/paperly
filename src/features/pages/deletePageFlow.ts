import type { DeletePageOutcome } from "@/lib/ipc";
import { useEditorStore } from "@/features/editor/editor.store";
import { useTreeStore } from "@/features/tree/tree.store";
import { closeDeletedPaths } from "./pagePaths";
import { requestDeleteConfirmation, showDeleteFailure } from "./deletePage.store";

export type DeleteFlowResult = DeletePageOutcome | { kind: "cancelled" };

export async function deletePageFlow(
  path: string,
  dirPath: string | null,
): Promise<DeleteFlowResult> {
  const name = path.split("/").pop() ?? path;
  if (!(await requestDeleteConfirmation(path, name))) return { kind: "cancelled" };

  const editor = useEditorStore.getState();
  const affectsOpenDocument =
    editor.path === path ||
    (dirPath !== null &&
      editor.path !== null &&
      (editor.path === dirPath || editor.path.startsWith(`${dirPath}/`)));
  if (affectsOpenDocument) {
    const saved = await editor.saveNow(editor.sessionId);
    if (!saved.ok && saved.reason !== "readOnly") {
      showDeleteFailure(saved.message);
      return { kind: "failed", remainingPaths: [path], message: saved.message };
    }
  }

  try {
    const outcome = await useTreeStore.getState().deleteNode(path, dirPath);
    if (outcome.kind !== "failed") closeDeletedPaths(outcome.deletedPaths);
    if (outcome.kind === "failed" || outcome.kind === "partial") {
      showDeleteFailure(outcome.message);
    }
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showDeleteFailure(message);
    return { kind: "failed", remainingPaths: [path], message };
  }
}
