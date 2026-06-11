import { useTranslation } from "react-i18next";
import { ChevronsRight, Languages, Moon, Sparkles, Sun, SunMoon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/features/ui/ui.store";
import { useThemeStore, type ThemeMode } from "@/features/theme/theme.store";
import { SUPPORTED_LANGUAGES } from "@/features/i18n/config";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const THEME_ICONS: Record<ThemeMode, React.ReactNode> = {
  system: <SunMoon size={16} />,
  light: <Sun size={16} />,
  dark: <Moon size={16} />,
};

export function MainHeader() {
  const { t, i18n } = useTranslation();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const toggleAgentPanel = useUiStore((s) => s.toggleAgentPanel);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-12 shrink-0 items-center gap-1 px-2",
        !sidebarOpen && "pl-[86px]",
      )}
    >
      {!sidebarOpen ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("titlebar.toggleSidebar")}
          onClick={toggleSidebar}
          className="text-ink-muted hover:text-ink"
        >
          <ChevronsRight size={16} />
        </Button>
      ) : null}

      <div data-tauri-drag-region className="flex-1" />

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("settings.theme")}
                className="text-ink-muted hover:text-ink"
              >
                {THEME_ICONS[mode]}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("settings.theme")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setMode("system")}>
            <SunMoon size={14} /> {t("settings.themeSystem")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("light")}>
            <Sun size={14} /> {t("settings.themeLight")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("dark")}>
            <Moon size={14} /> {t("settings.themeDark")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("settings.language")}
                className="text-ink-muted hover:text-ink"
              >
                <Languages size={16} />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("settings.language")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <DropdownMenuItem key={lang.id} onClick={() => void i18n.changeLanguage(lang.id)}>
              {lang.native}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("titlebar.toggleAgent")}
            onClick={toggleAgentPanel}
            className="text-ink-muted hover:text-ink"
          >
            <Sparkles size={16} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("titlebar.toggleAgent")}</TooltipContent>
      </Tooltip>
    </header>
  );
}
