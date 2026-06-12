import { useTranslation } from "react-i18next";
import { Download, Loader2, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUpdatesStore } from "@/features/updates/updates.store";
import { startInstall } from "@/features/updates/updates.service";

/**
 * Title-bar pill announcing an available update. Self-hides when there is
 * nothing to act on (idle/checking) so the header stays minimal on the
 * common path.
 *
 * Click semantics: pressing the pill while `available` or `error` kicks off
 * startInstall() immediately, no confirmation dialog. During download and
 * install it becomes a read-only progress indicator.
 */
export function UpdatePill() {
  const { t } = useTranslation();
  const status = useUpdatesStore((s) => s.status);

  if (status.kind === "idle" || status.kind === "checking") return null;

  const isError = status.kind === "error";
  const isBusy = status.kind === "downloading" || status.kind === "installing";

  let label: string;
  let LeftIcon = Download;
  let spinning = false;

  if (status.kind === "available") {
    label = t("updates.pill.available", { version: status.version });
  } else if (status.kind === "downloading") {
    const percent =
      status.total && status.total > 0
        ? Math.min(99, Math.floor((status.downloaded / status.total) * 100))
        : null;
    label =
      percent === null
        ? t("updates.pill.downloadingIndeterminate")
        : t("updates.pill.downloading", { percent });
    LeftIcon = Loader2;
    spinning = true;
  } else if (status.kind === "installing") {
    label = t("updates.pill.installing");
    LeftIcon = Loader2;
    spinning = true;
  } else {
    label = t("updates.pill.error");
    LeftIcon = RotateCcw;
  }

  const handleClick = () => {
    if (isBusy) return;
    void startInstall();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isBusy}
      title={label}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5",
        "text-xs font-medium leading-none transition-colors",
        isBusy ? "cursor-default" : "cursor-pointer",
        isError
          ? "border-warning/45 bg-warning/15 text-warning hover:bg-warning/25"
          : "border-accent-blue bg-accent-blue text-on-accent hover:bg-accent-blue-active",
      )}
    >
      <LeftIcon
        size={12}
        strokeWidth={2.5}
        className={spinning ? "animate-spin" : undefined}
      />
      <span>{label}</span>
    </button>
  );
}
