import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  SmilePlus,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { errorMessage, type Vault } from "@/lib/ipc";
import { useVaultsStore } from "@/features/vaults/vaults.store";
import { renameVault } from "@/features/vaults/renameVault";
import { EmojiGrid } from "@/components/page/EmojiPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/* A Popover (not a DropdownMenu) because the icon view embeds the emoji grid,
   whose search input would fight a Radix menu's typeahead for keystrokes.
   Sub-screens are internal views, so there is no nested-portal stacking. */

type View =
  | { kind: "list" }
  | { kind: "menu"; vaultId: string }
  | { kind: "icon"; vaultId: string }
  | { kind: "rename"; vaultId: string };

const itemClass =
  "flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-popover-foreground outline-hidden select-none hover:bg-accent hover:text-accent-foreground [&_svg]:shrink-0";

function Separator() {
  return <div className="-mx-1 my-1 h-px bg-foreground/10" />;
}

function VaultBadge({ vault }: { vault: Vault | null }) {
  if (vault?.icon) {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center text-sm leading-none">
        {vault.icon}
      </span>
    );
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-xs bg-accent-blue-soft text-[11px] font-bold text-accent-blue">
      {(vault?.name ?? "n")[0]?.toUpperCase()}
    </span>
  );
}

/** Back chevron + vault identity, heading every sub-view. */
function SubViewHeader({ vault, onBack }: { vault: Vault; onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1 border-b border-foreground/10 px-1 pt-0.5 pb-1.5">
      <button
        type="button"
        aria-label={t("sidebar.back")}
        onClick={onBack}
        className="flex size-5 items-center justify-center rounded-xs text-ink-faint hover:bg-hover-wash hover:text-ink"
      >
        <ChevronLeft size={14} />
      </button>
      <VaultBadge vault={vault} />
      <span className="min-w-0 truncate text-sm font-medium text-ink">{vault.name}</span>
    </div>
  );
}

export function VaultSwitcher() {
  const { t } = useTranslation();
  const vaults = useVaultsStore((s) => s.vaults);
  const activeVaultId = useVaultsStore((s) => s.activeVaultId);
  const setActive = useVaultsStore((s) => s.setActive);
  const addViaDialog = useVaultsStore((s) => s.addViaDialog);
  const removeVault = useVaultsStore((s) => s.remove);
  const setIcon = useVaultsStore((s) => s.setIcon);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  const active = vaults.find((v) => v.id === activeVaultId) ?? null;
  const viewVault =
    view.kind === "list" ? null : (vaults.find((v) => v.id === view.vaultId) ?? null);

  const openMenu = (vault: Vault) => setView({ kind: "menu", vaultId: vault.id });
  const backToMenu = () => {
    if (view.kind !== "list") setView({ kind: "menu", vaultId: view.vaultId });
  };
  const close = () => setOpen(false);

  const commitRename = async () => {
    if (!viewVault || renaming) return;
    const name = renameDraft.trim();
    if (!name || name === viewVault.name) {
      backToMenu();
      return;
    }
    setRenaming(true);
    try {
      await renameVault(viewVault.id, name);
      close();
    } catch (err) {
      setRenameError(errorMessage(err));
    } finally {
      setRenaming(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setView({ kind: "list" });
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1.5 text-left",
            "text-sm font-semibold text-ink transition-colors duration-(--dur-fast)",
            "hover:bg-hover-wash",
          )}
        >
          <VaultBadge vault={active} />
          <span className="min-w-0 truncate">{active?.name ?? t("sidebar.noVault")}</span>
          <ChevronDown size={13} className="shrink-0 text-ink-faint" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("gap-0", view.kind === "icon" ? "w-auto p-1" : "w-64 p-1")}
      >
        {view.kind === "list" ? (
          <>
            {vaults.map((vault) => (
              <div
                key={vault.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  void setActive(vault.id);
                  close();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void setActive(vault.id);
                    close();
                  }
                }}
                className={cn(itemClass, "group")}
              >
                <VaultBadge vault={vault} />
                <span className="min-w-0 flex-1 truncate">{vault.name}</span>
                {vault.id === activeVaultId ? (
                  <Check size={14} className="text-accent-blue group-hover:hidden" />
                ) : null}
                <button
                  type="button"
                  aria-label={t("sidebar.vaultOptions")}
                  onClick={(e) => {
                    e.stopPropagation();
                    openMenu(vault);
                  }}
                  className="hidden size-5 shrink-0 items-center justify-center rounded-xs text-ink-faint group-hover:flex hover:bg-hover-wash-strong hover:text-ink"
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
            ))}
            {vaults.length > 0 ? <Separator /> : null}
            <button
              type="button"
              onClick={() => {
                void addViaDialog();
                close();
              }}
              className={itemClass}
            >
              <FolderOpen size={14} />
              {t("sidebar.openVault")}
            </button>
          </>
        ) : null}

        {view.kind === "menu" && viewVault ? (
          <>
            <SubViewHeader vault={viewVault} onBack={() => setView({ kind: "list" })} />
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setView({ kind: "icon", vaultId: viewVault.id })}
                className={itemClass}
              >
                <SmilePlus size={14} />
                {viewVault.icon ? t("page.changeIcon") : t("page.addIcon")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRenameDraft(viewVault.name);
                  setRenameError(null);
                  setView({ kind: "rename", vaultId: viewVault.id });
                }}
                className={itemClass}
              >
                <Pencil size={14} />
                {t("sidebar.renameVault")}
              </button>
              <Separator />
              <button
                type="button"
                onClick={() => {
                  void removeVault(viewVault.id);
                  close();
                }}
                className={cn(
                  itemClass,
                  "text-destructive hover:bg-destructive/10 hover:text-destructive",
                )}
              >
                <Trash2 size={14} />
                {t("sidebar.removeVault")}
              </button>
            </div>
          </>
        ) : null}

        {view.kind === "icon" && viewVault ? (
          <>
            <SubViewHeader vault={viewVault} onBack={backToMenu} />
            {viewVault.icon ? (
              <div className="flex justify-end px-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    void setIcon(viewVault.id, null);
                    close();
                  }}
                  className="rounded-sm px-2 py-0.5 text-xs text-ink-muted transition-colors hover:bg-hover-wash hover:text-ink"
                >
                  {t("page.removeIcon")}
                </button>
              </div>
            ) : null}
            <div className="pt-1">
              <EmojiGrid
                onPick={(emoji) => {
                  void setIcon(viewVault.id, emoji);
                  close();
                }}
              />
            </div>
          </>
        ) : null}

        {view.kind === "rename" && viewVault ? (
          <>
            <SubViewHeader vault={viewVault} onBack={backToMenu} />
            <div className="flex flex-col gap-1 p-1.5">
              <input
                value={renameDraft}
                onChange={(e) => {
                  setRenameDraft(e.target.value);
                  setRenameError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename();
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    backToMenu();
                  }
                }}
                autoFocus
                spellCheck={false}
                disabled={renaming}
                className="w-full rounded-sm border border-accent-blue/50 bg-surface px-1.5 py-1 text-sm text-ink outline-none disabled:opacity-60"
              />
              <p className="text-xs text-ink-faint">{t("sidebar.renameVaultHint")}</p>
              {renameError ? <p className="text-xs text-destructive">{renameError}</p> : null}
            </div>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
