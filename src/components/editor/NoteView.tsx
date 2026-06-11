import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CMD, ipc, errorMessage, type TextFile } from "@/lib/ipc";
import { stripMdExt } from "@/features/tree/tree.types";

/**
 * Fase 1 placeholder: shows the raw markdown of the open note.
 * Replaced by the BlockNote editor in Fase 2.
 */
export function NoteView({ path }: { path: string }) {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    ipc<TextFile>(CMD.readFileText, { path })
      .then((file) => {
        if (!cancelled) setContent(file.content);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const title = stripMdExt(path.split("/").pop() ?? "");

  return (
    <div className="mx-auto h-full max-w-3xl px-12 py-10">
      <h1 className="text-[2.2rem] font-bold leading-tight tracking-[-0.02em] text-ink">
        {title}
      </h1>
      {error ? (
        <p className="mt-6 text-sm text-danger">{t("errors.generic", { message: error })}</p>
      ) : content === null ? (
        <p className="mt-6 text-sm text-ink-faint">{t("noteView.loading")}</p>
      ) : (
        <pre className="allow-select mt-6 whitespace-pre-wrap font-sans text-base leading-relaxed text-ink-secondary">
          {content}
        </pre>
      )}
    </div>
  );
}
