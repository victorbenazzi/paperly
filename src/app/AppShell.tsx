import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Sidebar, SidebarEdgeToggle } from "@/components/layout/Sidebar";
import { MainHeader } from "@/components/layout/MainHeader";
import { AgentPanel } from "@/components/layout/AgentPanel";
import { NoteView } from "@/components/editor/NoteView";
import { NoteEditor } from "@/components/editor/NoteEditor";
import { ImageView } from "@/components/editor/ImageView";
import { ExternalEditBanner } from "@/components/editor/ExternalEditBanner";
import { OutlineRail } from "@/components/page/OutlineRail";
import { QuickSwitcher } from "@/components/search/QuickSwitcher";
import { FullTextSearch } from "@/components/search/FullTextSearch";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { IMAGE_EXTS, isMarkdown } from "@/features/tree/tree.types";
import { WelcomeScreen } from "@/app/WelcomeScreen";
import { useUiStore } from "@/features/ui/ui.store";
import { useVaultsStore, activeVault } from "@/features/vaults/vaults.store";
import { useNavStore } from "@/features/nav/nav.store";
import { useWorkspacePersistence } from "@/features/vaults/workspace.persist";
import { useWatcherIntegration } from "@/features/watcher/useWatcherIntegration";
import { useKeyboardShortcuts } from "@/features/keybindings/useKeyboardShortcuts";
import { checkSilent } from "@/features/updates/updates.service";

/** Vault open, no note selected: a quiet nudge instead of the onboarding. */
function EmptyNoteHint() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center px-8">
      <p className="text-center text-sm text-ink-faint">{t("editor.empty")}</p>
    </div>
  );
}

export function AppShell() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const agentPanelOpen = useUiStore((s) => s.agentPanelOpen);
  const hydrate = useVaultsStore((s) => s.hydrate);
  const activeVaultId = useVaultsStore((s) => s.activeVaultId);
  const vault = useVaultsStore((s) => activeVault(s));
  const openPath = useNavStore((s) => s.openPath);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Silent updater probe, delayed past initial paint + vault hydration so it
  // never competes for IPC bandwidth on cold boot; no-op in dev builds.
  useEffect(() => {
    const handle = window.setTimeout(() => void checkSilent(), 3000);
    return () => window.clearTimeout(handle);
  }, []);

  useWorkspacePersistence(activeVaultId);
  useWatcherIntegration(activeVaultId);
  useKeyboardShortcuts();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas-soft">
      {/* Drawer: the wrapper's width animates while the sidebar keeps its own
          width anchored to the right edge, so it slides instead of squishing.
          Overflow only clips while closed/closing; open keeps the resize
          handle (which overhangs the border) fully hoverable. No vault means
          onboarding owns the whole window: no sidebar, no edge toggle. */}
      {vault ? (
        <div
          data-sidebar-drawer
          className={cn(
            "relative shrink-0 transition-[width] duration-200 ease-out",
            !sidebarOpen && "overflow-hidden",
          )}
          style={{ width: sidebarOpen ? sidebarWidth : 0 }}
        >
          <div className="absolute inset-y-0 right-0" style={{ width: sidebarWidth }}>
            <Sidebar />
          </div>
        </div>
      ) : null}
      {vault && !sidebarOpen ? <SidebarEdgeToggle /> : null}

      <main className="relative flex min-w-0 flex-1 flex-col bg-canvas">
        <MainHeader />
        <ExternalEditBanner />
        <OutlineRail />
        <div data-scroll-root className="min-h-0 flex-1 overflow-auto">
          {openPath ? (
            isMarkdown(openPath.split("/").pop() ?? "") ? (
              <NoteEditor key={openPath} path={openPath} />
            ) : IMAGE_EXTS.has(openPath.split(".").pop()?.toLowerCase() ?? "") ? (
              <ImageView path={openPath} />
            ) : (
              <NoteView path={openPath} />
            )
          ) : vault ? (
            <EmptyNoteHint />
          ) : (
            <WelcomeScreen />
          )}
        </div>
      </main>

      {agentPanelOpen ? <AgentPanel /> : null}

      <QuickSwitcher />
      <FullTextSearch />
      <SettingsDialog />
    </div>
  );
}
