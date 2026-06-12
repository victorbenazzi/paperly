import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { FilePlus2, FolderOpen, FolderPlus, Search, Settings } from "lucide-react";

import { isMac } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/features/ui/ui.store";
import { useVaultsStore, activeVault } from "@/features/vaults/vaults.store";
import { useRootActions } from "@/features/tree/useRootActions";
import { useSearchStore } from "@/features/search/search.store";
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

/** Magnetic pill behavior: the pill stretches vertically (and thins slightly)
    as the pointer approaches its center, and pulses taller on click. The
    transform is center-anchored, so it never moves from its spot. */
function useMagneticPill() {
  const pillRef = useRef<HTMLSpanElement | null>(null);

  const stretch = (influence: number) => {
    const el = pillRef.current;
    if (!el) return;
    el.style.transform =
      influence > 0
        ? `scaleY(${1 + 0.35 * influence}) scaleX(${1 - 0.2 * influence})`
        : "";
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const el = pillRef.current;
    if (!el || document.body.hasAttribute("data-sidebar-resizing")) return;
    const rect = el.getBoundingClientRect();
    const dist = Math.abs(e.clientY - (rect.top + rect.height / 2));
    stretch(Math.max(0, 1 - dist / 90));
  };

  const onPointerLeave = () => stretch(0);

  const pulse = () => {
    pillRef.current?.animate(
      [
        { transform: "scaleY(1)" },
        { transform: "scaleY(1.6)", offset: 0.4 },
        { transform: "scaleY(1.25)" },
      ],
      { duration: 200, easing: "ease-out" },
    );
  };

  return { pillRef, onPointerMove, onPointerLeave, pulse };
}

const PILL_PULSE_MS = 120;

/** Right border of the sidebar: drag anywhere to resize; the pill at the
    vertical center (shown while hovering the border) collapses on click.
    Cursor and tooltip belong to the pill only; the rest is pure resize. */
function ResizeHandle() {
  const { t } = useTranslation();
  const { pillRef, onPointerMove, onPointerLeave, pulse } = useMagneticPill();

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const onPill = (e.target as HTMLElement).closest("[data-sidebar-pill]") !== null;
    const startX = e.clientX;
    const startWidth = useUiStore.getState().sidebarWidth;
    let moved = false;

    handle.setPointerCapture(e.pointerId);
    document.body.setAttribute("data-sidebar-resizing", "");

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) > 3) moved = true;
      if (moved) useUiStore.getState().setSidebarWidth(startWidth + dx);
    };
    const onUp = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.releasePointerCapture(ev.pointerId);
      document.body.removeAttribute("data-sidebar-resizing");
      if (!moved && onPill) {
        // Let the height pulse read before the drawer slides shut.
        pulse();
        setTimeout(() => useUiStore.getState().toggleSidebar(), PILL_PULSE_MS);
      }
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="group absolute inset-y-0 -right-1 z-30 w-2 cursor-col-resize"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-sidebar-pill
            aria-label={t("sidebar.collapse")}
            className={cn(
              "absolute left-1/2 top-1/2 flex h-14 w-2 -translate-x-1/2 -translate-y-1/2",
              "cursor-pointer items-center justify-center",
            )}
          >
            <span
              ref={pillRef}
              className={cn(
                "h-12 w-1 rounded-full bg-ink-faint will-change-transform",
                "opacity-0 transition-[transform,opacity] duration-150 ease-out",
                "group-hover:opacity-90",
              )}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{t("sidebar.collapse")}</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Collapsed state: a pill hugging the left screen edge, vertically centered.
    Click reopens the sidebar. Rendered by AppShell when the sidebar is closed. */
export function SidebarEdgeToggle() {
  const { t } = useTranslation();
  const { pillRef, onPointerMove, onPointerLeave, pulse } = useMagneticPill();

  const onClick = () => {
    pulse();
    setTimeout(() => useUiStore.getState().toggleSidebar(), PILL_PULSE_MS);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("sidebar.expand")}
          onClick={onClick}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          className={cn(
            "group fixed left-0 top-1/2 z-40 flex h-20 w-4 -translate-y-1/2 items-center",
            // Fade in after the drawer finishes sliding shut.
            "animate-in fade-in fill-mode-backwards [animation-delay:180ms] [animation-duration:150ms]",
          )}
        >
          <span
            ref={pillRef}
            className={cn(
              "ml-1 h-12 w-1 rounded-full bg-ink-faint/55 will-change-transform",
              "transition-[transform,background-color] duration-150 ease-out",
              "group-hover:bg-ink-faint",
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{t("sidebar.expand")}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const vault = useVaultsStore((s) => activeVault(s));
  const addViaDialog = useVaultsStore((s) => s.addViaDialog);
  const openQuickSwitcher = useSearchStore((s) => s.openQuickSwitcher);
  const { newPageAtRoot, newFolderAtRoot } = useRootActions();

  return (
    <aside className="relative flex h-full w-full flex-col border-r border-hairline bg-canvas-soft">
      {/* Pure drag strip for the traffic lights; the vault switcher lives in
          its own row below, right above Search. */}
      <div data-tauri-drag-region className={cn("shrink-0", isMac ? "h-10" : "h-8")} />

      <div className="flex px-2 pb-1">
        <VaultSwitcher />
      </div>

      <div className="px-2 pb-2">
        <SidebarAction icon={<Search size={15} />} label={t("sidebar.search")} onClick={openQuickSwitcher} />
        <SidebarAction
          icon={<FilePlus2 size={15} />}
          label={t("sidebar.newPage")}
          onClick={() => void newPageAtRoot()}
        />
        <SidebarAction
          icon={<FolderPlus size={15} />}
          label={t("sidebar.newFolder")}
          onClick={() => void newFolderAtRoot()}
        />
        <SidebarAction
          icon={<Settings size={15} />}
          label={t("settings.title")}
          onClick={() => setSettingsOpen(true)}
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

      <ResizeHandle />
    </aside>
  );
}
