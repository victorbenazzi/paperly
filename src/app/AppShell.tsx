import { Sidebar } from "@/components/layout/Sidebar";
import { MainHeader } from "@/components/layout/MainHeader";
import { AgentPanel } from "@/components/layout/AgentPanel";
import { WelcomeScreen } from "@/app/WelcomeScreen";
import { useUiStore } from "@/features/ui/ui.store";

export function AppShell() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const agentPanelOpen = useUiStore((s) => s.agentPanelOpen);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas-soft">
      {sidebarOpen ? <Sidebar /> : null}

      <main className="flex min-w-0 flex-1 flex-col bg-canvas">
        <MainHeader />
        <div className="min-h-0 flex-1 overflow-auto">
          <WelcomeScreen />
        </div>
      </main>

      {agentPanelOpen ? <AgentPanel /> : null}
    </div>
  );
}
