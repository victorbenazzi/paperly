import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Languages, Moon, Sun, SunMoon } from "lucide-react";

import { useUiStore } from "@/features/ui/ui.store";
import { useThemeStore, type ThemeMode } from "@/features/theme/theme.store";
import { SUPPORTED_LANGUAGES } from "@/features/i18n/config";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEME_ICONS: Record<ThemeMode, React.ReactNode> = {
  system: <SunMoon size={15} />,
  light: <Sun size={15} />,
  dark: <Moon size={15} />,
};

const THEME_LABEL_KEYS: Record<ThemeMode, string> = {
  system: "settings.themeSystem",
  light: "settings.themeLight",
  dark: "settings.themeDark",
};

function SettingRow({
  icon,
  label,
  control,
}: {
  icon: React.ReactNode;
  label: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex h-10 items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2.5 text-sm text-ink">
        <span className="text-ink-muted">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      {control}
    </div>
  );
}

function ValueTrigger({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 font-normal text-ink-secondary hover:text-ink"
      >
        {children}
        <ChevronDown size={13} className="text-ink-faint" />
      </Button>
    </DropdownMenuTrigger>
  );
}

export function SettingsDialog() {
  const { t, i18n } = useTranslation();
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  const currentLanguage =
    SUPPORTED_LANGUAGES.find((l) => (i18n.resolvedLanguage ?? i18n.language) === l.id) ??
    SUPPORTED_LANGUAGES[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b border-hairline px-4 py-3.5">
          <DialogTitle className="text-sm font-semibold">{t("settings.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col px-4 py-2.5">
          <SettingRow
            icon={THEME_ICONS[mode]}
            label={t("settings.theme")}
            control={
              <DropdownMenu>
                <ValueTrigger>{t(THEME_LABEL_KEYS[mode])}</ValueTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {(Object.keys(THEME_LABEL_KEYS) as ThemeMode[]).map((m) => (
                    <DropdownMenuItem key={m} onClick={() => setMode(m)}>
                      {THEME_ICONS[m]}
                      <span className="flex-1">{t(THEME_LABEL_KEYS[m])}</span>
                      {mode === m ? <Check size={14} className="text-accent-blue" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />

          <SettingRow
            icon={<Languages size={15} />}
            label={t("settings.language")}
            control={
              <DropdownMenu>
                <ValueTrigger>{currentLanguage.native}</ValueTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <DropdownMenuItem
                      key={lang.id}
                      onClick={() => void i18n.changeLanguage(lang.id)}
                    >
                      <span className="flex-1">{lang.native}</span>
                      {currentLanguage.id === lang.id ? (
                        <Check size={14} className="text-accent-blue" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
