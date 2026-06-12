import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Picker } from "emoji-mart";
import data from "@emoji-mart/data";
import i18nEn from "@emoji-mart/data/i18n/en.json";
import i18nPt from "@emoji-mart/data/i18n/pt.json";

import { useThemeStore } from "@/features/theme/theme.store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * emoji-mart's Picker is a custom element (the React wrapper package does not
 * support React 19); we mount it imperatively. `data`/`i18n` are passed
 * locally so the picker never fetches from a CDN (offline-first).
 */
export function EmojiGrid({ onPick }: { onPick: (emoji: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const effective = useThemeStore((s) => s.effective);
  const { i18n } = useTranslation();
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const picker = new Picker({
      data,
      i18n: i18n.language.startsWith("pt") ? i18nPt : i18nEn,
      theme: effective,
      set: "native",
      previewPosition: "none",
      skinTonePosition: "search",
      autoFocus: true,
      onEmojiSelect: (e: { native?: string }) => {
        if (e.native) onPickRef.current(e.native);
      },
    }) as unknown as HTMLElement;
    host.replaceChildren(picker);
    return () => host.replaceChildren();
  }, [effective, i18n.language]);

  return <div ref={ref} />;
}

interface IconPickerPopoverProps {
  /** Current icon; enables the remove row when set. */
  icon: string | null;
  onPick: (emoji: string) => void;
  onRemove: () => void;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}

/** Popover wrapping the emoji grid plus a "remove" row when an icon exists. */
export function IconPickerPopover({
  icon,
  onPick,
  onRemove,
  align = "start",
  side = "bottom",
  children,
}: IconPickerPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className="w-auto gap-0 overflow-hidden p-0"
      >
        {icon ? (
          <div className="flex justify-end border-b border-foreground/10 px-2 py-1.5">
            <button
              type="button"
              onClick={() => {
                onRemove();
                setOpen(false);
              }}
              className="rounded-sm px-2 py-0.5 text-xs text-ink-muted transition-colors hover:bg-hover-wash hover:text-ink"
            >
              {t("page.removeIcon")}
            </button>
          </div>
        ) : null}
        <EmojiGrid
          onPick={(emoji) => {
            onPick(emoji);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
