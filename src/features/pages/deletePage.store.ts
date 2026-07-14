import { create } from "zustand";

interface DeleteRequest {
  path: string;
  name: string;
}

interface DeletePageDialogState {
  pending: DeleteRequest | null;
  failure: string | null;
  setPending: (pending: DeleteRequest | null) => void;
  setFailure: (failure: string | null) => void;
}

export const useDeletePageDialogStore = create<DeletePageDialogState>((set) => ({
  pending: null,
  failure: null,
  setPending: (pending) => set({ pending, failure: null }),
  setFailure: (failure) => set({ failure, pending: null }),
}));

let confirmationResolver: ((confirmed: boolean) => void) | null = null;

export function requestDeleteConfirmation(path: string, name: string): Promise<boolean> {
  confirmationResolver?.(false);
  useDeletePageDialogStore.getState().setPending({ path, name });
  return new Promise((resolve) => {
    confirmationResolver = resolve;
  });
}

export function resolveDeleteConfirmation(confirmed: boolean): void {
  const resolve = confirmationResolver;
  confirmationResolver = null;
  useDeletePageDialogStore.getState().setPending(null);
  resolve?.(confirmed);
}

export function showDeleteFailure(message: string): void {
  useDeletePageDialogStore.getState().setFailure(message);
}
