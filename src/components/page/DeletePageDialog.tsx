import { AlertTriangle, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  resolveDeleteConfirmation,
  useDeletePageDialogStore,
} from "@/features/pages/deletePage.store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DeletePageDialog() {
  const { t } = useTranslation();
  const pending = useDeletePageDialogStore((s) => s.pending);
  const failure = useDeletePageDialogStore((s) => s.failure);
  const setFailure = useDeletePageDialogStore((s) => s.setFailure);
  const open = pending !== null || failure !== null;

  const close = () => {
    if (pending) resolveDeleteConfirmation(false);
    else setFailure(null);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md" closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {failure ? (
              <AlertTriangle size={17} className="text-danger" />
            ) : (
              <Trash2 size={17} />
            )}
            {failure ? t("delete.failedTitle") : t("delete.confirmTitle")}
          </DialogTitle>
          <DialogDescription>
            {failure
              ? t("delete.failedDescription", { message: failure })
              : t("delete.confirmDescription", { name: pending?.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {failure ? (
            <Button onClick={() => setFailure(null)}>{t("common.close")}</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => resolveDeleteConfirmation(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={() => resolveDeleteConfirmation(true)}>
                {t("tree.delete")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
