import { useEffect } from "react";

import { Sidebar } from "@/components/layout/Sidebar";
import { MainHeader } from "@/components/layout/MainHeader";
import { AgentPanel } from "@/components/layout/AgentPanel";
import { NoteView } from "@/components/editor/NoteView";
import { WelcomeScreen } from "@/app/WelcomeScreen";
import { useUiStore } from "@/features/ui/ui.store";
import { useVaultsStore } from "@/features/vaults/vaults.store";
import { useNavStore } from "@/features/nav/nav.store";
import { useWorkspacePersistence } from "@/features/vaults/workspace.persist";

export function AppShell() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const agentPanelOpen = useUiStore((s) => s.agentPanelOpen);
  const hydrate = useVaultsStore((s) => s.hydrate);
  const activeVaultId = useVaultsStore((s) => s.activeVaultId);
  const openPath = useNavStore((s) => s.openPath);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useWorkspacePersistence(activeVaultId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas-soft">
      {sidebarOpen ? <Sidebar /> : null}

      <main className="flex min-w-0 flex-1 flex-col bg-canvas">
        <MainHeader />
        <div className="min-h-0 flex-1 overflow-auto">
          {openPath ? <NoteView path={openPath} /> : <WelcomeScreen />}
        </div>
      </main>

      {agentPanelOpen ? <AgentPanel /> : null}
    </div>
  );
}
