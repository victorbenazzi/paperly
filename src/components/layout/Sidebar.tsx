import { useTranslation } from "react-i18next";
import { ChevronsLeft, FilePlus2, FolderOpen, Search } from "lucide-react";

import { isMac } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/features/ui/ui.store";
import { useVaultsStore, activeVault } from "@/features/vaults/vaults.store";
import { useTreeStore } from "@/features/tree/tree.store";
import { useNavStore } from "@/features/nav/nav.store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileTree } from "@/components/tree/FileTree";
import { VaultSwitcher } from "./VaultSwitcher";

function SidebarAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm",
        "text-ink-secondary transition-colors duration-(--dur-fast)",
        "hover:bg-hover-wash hover:text-ink",
        "focus-visible:outline-2 focus-visible:outline-ring/60",
      )}
    >
      <span className="text-ink-muted">{icon}</span>
      {label}
    </button>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const vault = useVaultsStore((s) => activeVault(s));
  const addViaDialog = useVaultsStore((s) => s.addViaDialog);
  const createNote = useTreeStore((s) => s.createNote);
  const startRename = useTreeStore((s) => s.startRename);
  const select = useTreeStore((s) => s.select);
  const openNote = useNavStore((s) => s.open);

  const newPageAtRoot = async () => {
    if (!vault) return;
    const path = await createNote(vault.path, t("tree.untitled"));
    select(path);
    openNote(path);
    startRename(path);
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-hairline bg-canvas-soft">
      {/* Drag strip under the traffic lights. Every element on the click path
          needs data-tauri-drag-region or the drag silently breaks. */}
      <div
        data-tauri-drag-region
        className={cn(
          "flex h-12 shrink-0 items-center justify-end",
          isMac ? "pl-[78px]" : "pl-3",
          "pr-2",
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("titlebar.toggleSidebar")}
              onClick={toggleSidebar}
              className="text-ink-muted hover:text-ink"
            >
              <ChevronsLeft size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("titlebar.toggleSidebar")}</TooltipContent>
        </Tooltip>
      </div>

      <VaultSwitcher />

      <div className="mt-1 px-2 pb-2">
        <SidebarAction icon={<Search size={15} />} label={t("sidebar.search")} />
        <SidebarAction
          icon={<FilePlus2 size={15} />}
          label={t("sidebar.newPage")}
          onClick={() => void newPageAtRoot()}
        />
      </div>

      <div className="mx-3 mb-1 border-t border-hairline" />

      {vault ? (
        <FileTree key={vault.id} rootPath={vault.path} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-ink-faint">{t("sidebar.noVault")}</p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-md"
            onClick={() => void addViaDialog()}
          >
            <FolderOpen size={14} />
            {t("sidebar.openVault")}
          </Button>
        </div>
      )}
    </aside>
  );
}
