import { useTranslation } from "react-i18next";
import { MoreHorizontal, Settings, Sparkles, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { CMD, errorMessage, ipc } from "@/lib/ipc";
import { isMarkdown, stripMdExt } from "@/features/tree/tree.types";
import { useUiStore } from "@/features/ui/ui.store";
import { useVaultsStore, activeVault } from "@/features/vaults/vaults.store";
import { useNavStore } from "@/features/nav/nav.store";
import { useTreeStore } from "@/features/tree/tree.store";
import { closeDeletedPaths } from "@/features/pages/pagePaths";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function MainHeader() {
  const { t } = useTranslation();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const vault = useVaultsStore((s) => activeVault(s));
  const toggleAgentPanel = useUiStore((s) => s.toggleAgentPanel);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const openPath = useNavStore((s) => s.openPath);
  const deleteNode = useTreeStore((s) => s.deleteNode);

  const reveal = () => {
    if (openPath) void ipc(CMD.revealInFinder, { path: openPath }).catch(() => {});
  };

  const remove = async () => {
    if (!openPath) return;
    const name = openPath.split("/").pop() ?? "";
    // Folder notes pair `X.md` with `X/`; deleteNode ignores a missing dir.
    const dirPath = isMarkdown(name)
      ? openPath.slice(0, openPath.length - name.length) + stripMdExt(name)
      : null;
    try {
      closeDeletedPaths(openPath, dirPath);
      await deleteNode(openPath, dirPath);
    } catch (err) {
      console.error("delete failed:", errorMessage(err));
    }
  };

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-12 shrink-0 items-center gap-1 px-2",
        // Sidebar closed OR hidden (no vault): clear the macOS traffic lights.
        (!sidebarOpen || !vault) && "pl-[86px]",
      )}
    >
      <Breadcrumb />
      <div data-tauri-drag-region className="min-w-0 flex-1" />

      {openPath ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("titlebar.pageOptions")}
                  className="text-ink-muted hover:text-ink"
                >
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("titlebar.pageOptions")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={reveal}>{t("tree.reveal")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void remove()} variant="destructive">
              <Trash2 size={14} />
              {t("tree.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {vault ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("titlebar.toggleAgent")}
              onClick={toggleAgentPanel}
              className="text-ink-muted hover:text-ink"
            >
              <Sparkles size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("titlebar.toggleAgent")}</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("settings.title")}
              onClick={() => setSettingsOpen(true)}
              className="text-ink-muted hover:text-ink"
            >
              <Settings size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("settings.title")}</TooltipContent>
        </Tooltip>
      )}
    </header>
  );
}
