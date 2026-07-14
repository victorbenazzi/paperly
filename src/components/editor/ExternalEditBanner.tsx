import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw, X } from "lucide-react";

import { useExternalEditStore } from "@/features/editor/externalEdit.store";
import { useEditorStore } from "@/features/editor/editor.store";
import { Button } from "@/components/ui/button";

export function ExternalEditBanner() {
  const { t } = useTranslation();
  const edit = useExternalEditStore((s) => s.edit);
  const dismiss = useExternalEditStore((s) => s.dismiss);
  const [busy, setBusy] = useState(false);

  if (!edit) return null;

  const isConflict = edit.kind === "conflict";

  const reloadFromDisk = async () => {
    setBusy(true);
    const result = await useEditorStore.getState().reloadFromDisk(edit.path, edit.diskContent);
    setBusy(false);
    if (result.ok) dismiss();
  };

  const keepMyVersion = async () => {
    setBusy(true);
    const result = await useEditorStore.getState().forceSave();
    setBusy(false);
    if (result.ok) dismiss();
  };

  return (
    <div
      className={
        isConflict
          ? "flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2"
          : "flex items-center gap-3 border-b border-accent/20 bg-accent-soft px-4 py-2"
      }
    >
      {isConflict ? (
        <AlertTriangle size={14} className="shrink-0 text-warning" />
      ) : (
        <RefreshCw size={14} className="shrink-0 text-accent" />
      )}
      <span className="flex-1 text-sm text-ink-secondary">
        {t(isConflict ? "editor.conflictMessage" : "editor.externalEditMessage")}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        disabled={busy}
        onClick={() => void reloadFromDisk()}
      >
        {isConflict ? <RefreshCw size={12} className="mr-1" /> : null}
        {t("editor.reloadFromDisk")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        disabled={busy}
        onClick={() => void keepMyVersion()}
      >
        {t("editor.keepMyVersion")}
      </Button>
      <button
        type="button"
        disabled={busy}
        onClick={dismiss}
        className="text-ink-faint hover:text-ink disabled:opacity-50"
      >
        <X size={14} />
      </button>
    </div>
  );
}
