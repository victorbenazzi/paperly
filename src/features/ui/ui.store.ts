import { create } from "zustand";

interface UiState {
  sidebarOpen: boolean;
  agentPanelOpen: boolean;
  toggleSidebar: () => void;
  toggleAgentPanel: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  agentPanelOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleAgentPanel: () => set((s) => ({ agentPanelOpen: !s.agentPanelOpen })),
}));
