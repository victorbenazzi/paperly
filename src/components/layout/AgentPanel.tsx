import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";

export function AgentPanel() {
  const { t } = useTranslation();

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-hairline bg-canvas-soft">
      <div data-tauri-drag-region className="flex h-12 shrink-0 items-center px-4">
        <span className="text-sm font-medium text-ink-secondary">{t("agent.title")}</span>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent-blue-soft text-accent-blue">
          <Sparkles size={18} />
        </span>
        <p className="text-sm text-ink-faint">{t("agent.placeholder")}</p>
      </div>
    </aside>
  );
}
