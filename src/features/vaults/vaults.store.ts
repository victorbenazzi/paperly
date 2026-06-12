import { create } from "zustand";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { CMD, errorMessage, ipc, type Vault, type VaultsFile } from "@/lib/ipc";

interface VaultsState {
  vaults: Vault[];
  activeVaultId: string | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  /** Open the native folder picker and register the chosen folder. */
  addViaDialog: () => Promise<Vault | null>;
  /** Pick a parent folder, create a brand-new empty folder inside it and open
      it as a vault. `baseName` gets a numeric suffix on collision. */
  createViaDialog: (baseName: string) => Promise<Vault | null>;
  remove: (id: string) => Promise<void>;
  /** Rename the vault AND its folder on disk. Returns the updated vault;
      callers that hold absolute paths must remap them (see renameVault.ts). */
  rename: (id: string, name: string) => Promise<Vault>;
  setIcon: (id: string, icon: string | null) => Promise<void>;
  setActive: (id: string) => Promise<void>;
}

/** Most recently opened vault; fallback when the active one goes away. */
function mostRecentVault(vaults: Vault[]): Vault | null {
  let best: Vault | null = null;
  for (const v of vaults) {
    if (!best || v.lastOpenedAt > best.lastOpenedAt) best = v;
  }
  return best;
}

export const useVaultsStore = create<VaultsState>((set, get) => ({
  vaults: [],
  activeVaultId: null,
  hydrated: false,

  hydrate: async () => {
    const file = await ipc<VaultsFile>(CMD.vaultList);
    // The file may carry no active id (or a dangling one) while vaults still
    // exist; fall back so onboarding only ever shows with zero vaults.
    const active =
      file.vaults.find((v) => v.id === file.lastActiveVaultId) ?? mostRecentVault(file.vaults);
    set({
      vaults: file.vaults,
      activeVaultId: active?.id ?? null,
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

  createViaDialog: async (baseName) => {
    const picked = await openDialog({ directory: true, multiple: false });
    if (!picked || typeof picked !== "string") return null;
    let vault: Vault | null = null;
    for (let i = 1; i <= 50 && !vault; i++) {
      const name = i === 1 ? baseName : `${baseName} ${i}`;
      try {
        vault = await ipc<Vault>(CMD.vaultCreate, { directory: picked, name });
      } catch (err) {
        if (!errorMessage(err).includes("already exists")) throw err;
      }
    }
    if (!vault) return null;
    const existing = get().vaults.filter((v) => v.id !== vault.id);
    set({ vaults: [...existing, vault], activeVaultId: vault.id });
    return vault;
  },

  remove: async (id) => {
    await ipc(CMD.vaultRemove, { id });
    const vaults = get().vaults.filter((v) => v.id !== id);
    let activeVaultId = get().activeVaultId;
    if (activeVaultId === id) {
      // Removing the active vault promotes the most recently opened one;
      // onboarding only comes back when no vault is left at all.
      const next = mostRecentVault(vaults);
      activeVaultId = next?.id ?? null;
      if (next) await ipc(CMD.vaultSetActive, { id: next.id });
    }
    set({ vaults, activeVaultId });
  },

  rename: async (id, name) => {
    const vault = await ipc<Vault>(CMD.vaultRename, { id, name });
    set({ vaults: get().vaults.map((v) => (v.id === id ? vault : v)) });
    return vault;
  },

  setIcon: async (id, icon) => {
    const vault = await ipc<Vault>(CMD.vaultSetIcon, { id, icon });
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
