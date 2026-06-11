import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useVaultsStore } from "@/features/vaults/vaults.store";

const STICKERS = [
  "var(--sticker-sky)",
  "var(--sticker-pink)",
  "var(--sticker-teal)",
  "var(--sticker-orange)",
  "var(--sticker-green)",
  "var(--sticker-purple)",
];

export function WelcomeScreen() {
  const { t } = useTranslation();
  const addViaDialog = useVaultsStore((s) => s.addViaDialog);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex max-w-md flex-col items-center px-8 text-center">
        {/* decorative sticker dots: the only place color is allowed to play */}
        <div className="mb-7 flex items-center gap-2.5">
          {STICKERS.map((color, i) => (
            <span
              key={color}
              className="size-2.5 rounded-full"
              style={{
                backgroundColor: color,
                transform: `translateY(${i % 2 === 0 ? -3 : 3}px)`,
              }}
            />
          ))}
        </div>

        <h1 className="text-balance text-[2rem] font-bold leading-[1.1] tracking-[-0.02em] text-ink">
          {t("welcome.title")}
        </h1>
        <p className="mt-4 text-pretty text-base leading-relaxed text-ink-muted">
          {t("welcome.subtitle")}
        </p>

        <Button
          size="lg"
          className="mt-8 gap-2 rounded-full px-6"
          onClick={() => void addViaDialog()}
        >
          <FolderOpen size={16} />
          {t("welcome.openVault")}
        </Button>

        <p className="mt-6 text-xs text-ink-faint">{t("welcome.hint")}</p>
      </div>
    </div>
  );
}
