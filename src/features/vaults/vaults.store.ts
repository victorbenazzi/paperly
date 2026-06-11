import { create } from "zustand";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { CMD, ipc, type Vault, type VaultsFile } from "@/lib/ipc";

interface VaultsState {
  vaults: Vault[];
  activeVaultId: string | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  /** Open the native folder picker and register the chosen folder. */
  addViaDialog: () => Promise<Vault | null>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
}

export const useVaultsStore = create<VaultsState>((set, get) => ({
  vaults: [],
  activeVaultId: null,
  hydrated: false,

  hydrate: async () => {
    const file = await ipc<VaultsFile>(CMD.vaultList);
    set({
      vaults: file.vaults,
      activeVaultId: file.lastActiveVaultId,
      hydrated: true,
    });
  },

  addViaDialog: async () => {
    const picked = await openDialog({ directory: true, multiple: false });
    if (!picked || typeof picked !== "string") return null;
    const vault = await ipc<Vault>(CMD.vaultAdd, { path: picked });
    const existing = get().vaults.filter((v) => v.id !== vault.id);
    set({ vaults: [...existing, vault], activeVaultId: vault.id });
    return vault;
  },

  remove: async (id) => {
    await ipc(CMD.vaultRemove, { id });
    const vaults = get().vaults.filter((v) => v.id !== id);
    set({
      vaults,
      activeVaultId: get().activeVaultId === id ? null : get().activeVaultId,
    });
  },

  rename: async (id, name) => {
    const vault = await ipc<Vault>(CMD.vaultRename, { id, name });
    set({ vaults: get().vaults.map((v) => (v.id === id ? vault : v)) });
  },

  setActive: async (id) => {
    if (get().activeVaultId === id) return;
    await ipc(CMD.vaultSetActive, { id });
    set({ activeVaultId: id });
  },
}));

export function activeVault(state: Pick<VaultsState, "vaults" | "activeVaultId">): Vault | null {
  return state.vaults.find((v) => v.id === state.activeVaultId) ?? null;
}
