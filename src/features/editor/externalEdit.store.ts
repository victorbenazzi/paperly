import { create } from "zustand";

/**
 * Pending external edit on the open note, detected by the watcher.
 * - `reload`: the editor is clean; offer to swap in the disk version.
 * - `conflict`: the editor has unsaved changes; the user picks a side.
 */
export interface ExternalEdit {
  kind: "reload" | "conflict";
  path: string;
  diskContent: string;
}

interface ExternalEditState {
  edit: ExternalEdit | null;
  setEdit: (edit: ExternalEdit) => void;
  dismiss: () => void;
}

export const useExternalEditStore = create<ExternalEditState>((set) => ({
  edit: null,
  setEdit: (edit) => set({ edit }),
  dismiss: () => set({ edit: null }),
}));
