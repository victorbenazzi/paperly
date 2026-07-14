import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listenAppEvent } from "@/lib/appEvents";
import { EV } from "@/lib/events";
import { CMD, errorMessage, ipc } from "@/lib/ipc";
import { useEditorStore } from "@/features/editor/editor.store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AppCloseGuard() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const inFlight = useRef(false);

  const approveClose = useCallback(async () => {
    try {
      await ipc(CMD.appCloseAfterFlush);
    } catch (closeError) {
      setError(errorMessage(closeError));
      setConfirmDiscard(false);
    }
  }, []);

  const flushAndClose = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    setConfirmDiscard(false);
    const result = await useEditorStore.getState().saveNow();
    setSaving(false);
    inFlight.current = false;
    if (result.ok || result.reason === "readOnly") {
      await approveClose();
      return;
    }
    setError(result.message);
  }, [approveClose]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listenAppEvent(EV.appCloseRequested, () => void flushAndClose()).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [flushAndClose]);

  return (
    <Dialog
      open={error !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          setConfirmDiscard(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-md" closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle size={17} className="text-danger" />
            {t(
              confirmDiscard
                ? "editor.closeWithoutSavingConfirmTitle"
                : "editor.closeSaveFailedTitle",
            )}
          </DialogTitle>
          <DialogDescription>
            {confirmDiscard
              ? t("editor.closeWithoutSavingConfirmDescription")
              : t("editor.closeSaveFailedDescription", { message: error })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirmDiscard) setConfirmDiscard(false);
              else setError(null);
            }}
          >
            {t("common.cancel")}
          </Button>
          {confirmDiscard ? (
            <Button variant="destructive" onClick={() => void approveClose()}>
              {t("editor.closeWithoutSavingConfirmAction")}
            </Button>
          ) : (
            <>
              <Button variant="destructive" onClick={() => setConfirmDiscard(true)}>
                {t("editor.closeWithoutSaving")}
              </Button>
              <Button onClick={() => void flushAndClose()} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {t("common.retry")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
