import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import {
  Check,
  ChevronDown,
  Download,
  Languages,
  Loader2,
  Moon,
  RefreshCw,
  Sun,
  SunMoon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useUiStore } from "@/features/ui/ui.store";
import { useThemeStore, type ThemeMode } from "@/features/theme/theme.store";
import { useUpdatesStore } from "@/features/updates/updates.store";
import { checkManual, startInstall } from "@/features/updates/updates.service";
import { SUPPORTED_LANGUAGES } from "@/features/i18n/config";
import { useEditorStore } from "@/features/editor/editor.store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

/**
 * Manual update check, the explicit counterpart to the silent boot probe.
 * One button whose label tracks the shared updates store, so a check started
 * here and the title-bar pill never disagree about what is happening.
 */
function UpdatesControl() {
  const { t } = useTranslation();
  const status = useUpdatesStore((s) => s.status);

  let label: string;
  let Icon = RefreshCw;
  let spinning = false;
  let onClick: (() => void) | null = () => void checkManual();
  let tone: "default" | "accent" | "warning" = "default";

  if (status.kind === "checking") {
    label = t("updates.check.checking");
    Icon = Loader2;
    spinning = true;
    onClick = null;
  } else if (status.kind === "upToDate") {
    label = t("updates.check.upToDate");
    Icon = Check;
  } else if (status.kind === "checkError") {
    label = t("updates.check.failed");
    tone = "warning";
  } else if (status.kind === "available") {
    label = t("updates.check.install", { version: status.version });
    Icon = Download;
    onClick = () => void startInstall();
    tone = "accent";
  } else if (status.kind === "downloading") {
    const percent =
      status.total && status.total > 0
        ? Math.min(99, Math.floor((status.downloaded / status.total) * 100))
        : null;
    label =
      percent === null
        ? t("updates.pill.downloadingIndeterminate")
        : t("updates.pill.downloading", { percent });
    Icon = Loader2;
    spinning = true;
    onClick = null;
  } else if (status.kind === "installing") {
    label = t("updates.pill.installing");
    Icon = Loader2;
    spinning = true;
    onClick = null;
  } else if (status.kind === "error") {
    label = t("updates.pill.error");
    onClick = () => void startInstall();
    tone = "warning";
  } else {
    label = t("updates.check.action");
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!onClick}
      onClick={onClick ?? undefined}
      title={status.kind === "checkError" ? status.message : undefined}
      className={cn(
        "font-normal",
        tone === "accent" && "text-accent-blue hover:text-accent-blue",
        tone === "warning" && "text-warning hover:text-warning",
      )}
    >
      <Icon size={13} className={spinning ? "animate-spin" : undefined} />
      {label}
    </Button>
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
  const [changingLanguage, setChangingLanguage] = useState(false);

  // null while resolving and in the browser-mock mode, where the Tauri IPC
  // behind getVersion does not exist; the row just omits the version then.
  const [appVersion, setAppVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(null));
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Check outcomes are answers to "is there an update right now?", so a
      // reopened dialog should ask again instead of replaying a stale answer.
      const kind = useUpdatesStore.getState().status.kind;
      if (kind === "upToDate" || kind === "checkError") {
        useUpdatesStore.getState().reset();
      }
    }
  };

  const currentLanguage =
    SUPPORTED_LANGUAGES.find((l) => (i18n.resolvedLanguage ?? i18n.language) === l.id) ??
    SUPPORTED_LANGUAGES[0];

  const changeLanguage = async (languageId: string) => {
    if (changingLanguage || languageId === currentLanguage.id) return;
    setChangingLanguage(true);
    try {
      const session = useEditorStore.getState();
      if (session.path && session.status !== "readOnly") {
        const saved = await session.saveNow(session.sessionId);
        if (!saved.ok) return;
      }
      await i18n.changeLanguage(languageId);
    } finally {
      setChangingLanguage(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md" closeLabel={t("common.close")}>
        <DialogHeader className="border-b border-hairline px-4 py-3.5">
          <DialogTitle className="text-sm font-semibold">{t("settings.title")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("settings.description")}
          </DialogDescription>
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
                      disabled={changingLanguage}
                      onClick={() => void changeLanguage(lang.id)}
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

          <SettingRow
            icon={<RefreshCw size={15} />}
            label={
              appVersion
                ? `${t("settings.updates")} (v${appVersion})`
                : t("settings.updates")
            }
            control={<UpdatesControl />}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
