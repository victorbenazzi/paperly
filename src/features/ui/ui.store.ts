import { create } from "zustand";

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_DEFAULT_WIDTH = 240;

const WIDTH_STORAGE_KEY = "paperly:sidebarWidth";

function clampWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? clampWidth(n) : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

interface UiState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  agentPanelOpen: boolean;
  settingsOpen: boolean;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleAgentPanel: () => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  sidebarWidth: readStoredWidth(),
  agentPanelOpen: false,
  settingsOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarWidth: (width) => {
    const clamped = clampWidth(width);
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      // best effort; the session still resizes
    }
    set({ sidebarWidth: clamped });
  },
  toggleAgentPanel: () => set((s) => ({ agentPanelOpen: !s.agentPanelOpen })),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
}));
