import { useTranslation } from "react-i18next";
import { FolderOpen, Plus } from "lucide-react";

import logoAzul from "@/assets/logo-transparente-azul.svg";
import { useVaultsStore } from "@/features/vaults/vaults.store";

function OptionCard({
  icon,
  tint,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  tint: string;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full items-center gap-3.5 rounded-lg border border-hairline bg-surface px-4 py-3.5 text-left " +
        "shadow-soft transition-colors duration-(--dur-fast) hover:bg-hover-wash " +
        "focus-visible:outline-2 focus-visible:outline-ring/60"
      }
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-md"
        style={{
          backgroundColor: `color-mix(in srgb, ${tint} 12%, transparent)`,
          color: tint,
        }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] text-ink-muted">{hint}</span>
      </span>
    </button>
  );
}

/** Onboarding shown when no vault is registered yet (fresh install or all
    vaults removed). Friendly "start your workspace" instead of an error. */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const addViaDialog = useVaultsStore((s) => s.addViaDialog);
  const createViaDialog = useVaultsStore((s) => s.createViaDialog);

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <img src={logoAzul} alt="" draggable={false} className="h-20 w-auto select-none" />
          <h1 className="mt-6 text-balance text-2xl font-bold tracking-[-0.015em] text-ink">
            {t("welcome.title")}
          </h1>
          <p className="mt-3 max-w-sm text-pretty text-sm leading-relaxed text-ink-muted">
            {t("welcome.subtitle")}
          </p>
        </div>

        <div className="my-7 border-t border-hairline" />

        <div className="flex flex-col gap-3">
          <OptionCard
            icon={<Plus size={18} />}
            tint="var(--accent)"
            title={t("welcome.createEmpty")}
            hint={t("welcome.createEmptyHint")}
            onClick={() => void createViaDialog(t("welcome.defaultVaultName"))}
          />
          <OptionCard
            icon={<FolderOpen size={17} />}
            tint="var(--sticker-green)"
            title={t("welcome.chooseFolder")}
            hint={t("welcome.chooseFolderHint")}
            onClick={() => void addViaDialog()}
          />
        </div>

        <p className="mt-7 text-center text-xs text-ink-faint">{t("welcome.hint")}</p>
      </div>
    </div>
  );
}
