import { useTranslation } from "react-i18next";
import { Check, ChevronDown, FolderOpen, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useVaultsStore } from "@/features/vaults/vaults.store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function VaultSwitcher() {
  const { t } = useTranslation();
  const vaults = useVaultsStore((s) => s.vaults);
  const activeVaultId = useVaultsStore((s) => s.activeVaultId);
  const setActive = useVaultsStore((s) => s.setActive);
  const addViaDialog = useVaultsStore((s) => s.addViaDialog);
  const removeVault = useVaultsStore((s) => s.remove);

  const active = vaults.find((v) => v.id === activeVaultId) ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1.5 text-left",
            "text-sm font-semibold text-ink transition-colors duration-(--dur-fast)",
            "hover:bg-hover-wash",
          )}
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-xs bg-accent-blue-soft text-[11px] font-bold text-accent-blue">
            {(active?.name ?? "n")[0]?.toUpperCase()}
          </span>
          <span className="min-w-0 truncate">
            {active?.name ?? t("sidebar.noVault")}
          </span>
          <ChevronDown size={13} className="shrink-0 text-ink-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {vaults.map((vault) => (
          <DropdownMenuItem
            key={vault.id}
            onClick={() => void setActive(vault.id)}
            className="gap-2"
          >
            <span className="flex size-5 items-center justify-center rounded-xs bg-accent-blue-soft text-[11px] font-bold text-accent-blue">
              {vault.name[0]?.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">{vault.name}</span>
            {vault.id === activeVaultId ? <Check size={14} className="text-accent-blue" /> : null}
          </DropdownMenuItem>
        ))}
        {vaults.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onClick={() => void addViaDialog()} className="gap-2">
          <FolderOpen size={14} />
          {t("sidebar.openVault")}
        </DropdownMenuItem>
        {active ? (
          <DropdownMenuItem
            onClick={() => void removeVault(active.id)}
            className="gap-2"
            variant="destructive"
          >
            <Trash2 size={14} />
            {t("sidebar.removeVault")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
