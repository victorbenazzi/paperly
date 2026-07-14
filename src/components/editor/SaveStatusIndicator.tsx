import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useEditorStore, type SaveStatus } from "@/features/editor/editor.store";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SaveStatusIndicator() {
  const { t } = useTranslation();
  const status = useEditorStore((s) => s.status);
  const error = useEditorStore((s) => s.error);
  const [visible, setVisible] = useState<SaveStatus | null>(null);

  useEffect(() => {
    if (status === "error") {
      setVisible("error");
      return;
    }
    if (status === "saving") {
      const timer = window.setTimeout(() => setVisible("saving"), 250);
      return () => window.clearTimeout(timer);
    }
    if (status === "saved") {
      setVisible("saved");
      const timer = window.setTimeout(() => setVisible(null), 1500);
      return () => window.clearTimeout(timer);
    }
    setVisible(null);
  }, [status]);

  if (visible === "error") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-danger hover:text-danger"
            onClick={() => void useEditorStore.getState().saveNow()}
          >
            <AlertCircle size={13} />
            {t("editor.saveError")}
            <RotateCcw size={12} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{error ?? t("editor.saveError")}</TooltipContent>
      </Tooltip>
    );
  }

  if (visible === "saving") {
    return (
      <span className="flex h-7 items-center gap-1.5 px-2 text-xs text-ink-muted">
        <Loader2 size={12} className="animate-spin" />
        {t("editor.saving")}
      </span>
    );
  }

  if (visible === "saved") {
    return (
      <span className="flex h-7 items-center gap-1.5 px-2 text-xs text-ink-muted">
        <Check size={12} />
        {t("editor.saved")}
      </span>
    );
  }

  return null;
}
