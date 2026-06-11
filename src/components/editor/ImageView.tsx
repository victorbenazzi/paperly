import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { fileObjectUrl } from "@/features/assets/assets";
import { errorMessage } from "@/lib/ipc";
import { cn } from "@/lib/utils";

/** Standalone viewer for images opened from the tree. Click toggles fit/100%. */
export function ImageView({ path }: { path: string }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualSize, setActualSize] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(null);
    fileObjectUrl(path)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const name = path.split("/").pop() ?? "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-center border-b border-hairline">
        <span className="text-xs text-ink-muted">{name}</span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-canvas-soft p-8">
        {error ? (
          <p className="text-sm text-danger">{t("errors.generic", { message: error })}</p>
        ) : url ? (
          <img
            src={url}
            alt={name}
            onClick={() => setActualSize((v) => !v)}
            className={cn(
              "rounded-lg shadow-soft",
              actualSize ? "max-h-none max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain",
            )}
          />
        ) : (
          <p className="text-sm text-ink-faint">{t("noteView.loading")}</p>
        )}
      </div>
    </div>
  );
}
