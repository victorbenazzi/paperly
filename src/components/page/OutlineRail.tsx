import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useOutlineStore } from "@/features/outline/outline.store";

/** Bar width per heading level, mirroring Notion's depth cue. */
function barWidth(level: number): number {
  return level <= 1 ? 16 : level === 2 ? 10 : 6;
}

function blockEl(id: string): Element | null {
  return document.querySelector(`[data-id="${CSS.escape(id)}"]`);
}

/**
 * Notion-style outline rail: thin bars on the right edge of the note, one per
 * heading. Hovering swaps them for a panel with the heading titles; clicking
 * one scrolls the note to that heading. Tracks the section currently in view.
 */
export function OutlineRail() {
  const { t } = useTranslation();
  const headings = useOutlineStore((s) => s.headings);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Scroll spy: the active heading is the last one above the viewport line.
  useEffect(() => {
    if (headings.length === 0) return;
    const root = document.querySelector("[data-scroll-root]");
    if (!root) return;
    const update = () => {
      const rootTop = root.getBoundingClientRect().top;
      let current = headings[0]?.id ?? null;
      for (const h of headings) {
        const el = blockEl(h.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - rootTop <= 96) current = h.id;
        else break;
      }
      setActiveId(current);
    };
    update();
    root.addEventListener("scroll", update, { passive: true });
    return () => root.removeEventListener("scroll", update);
  }, [headings]);

  if (headings.length === 0) return null;

  const jump = (id: string) => {
    blockEl(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };

  return (
    <div
      aria-label={t("page.outline")}
      className="absolute top-1/2 right-0 z-20 -translate-y-1/2"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className={cn(
          "flex max-h-[60vh] flex-col items-end gap-2 overflow-hidden py-2 pr-3 pl-4",
          "transition-opacity duration-(--dur-fast)",
          open && "pointer-events-none opacity-0",
        )}
      >
        {headings.map((h) => (
          <div
            key={h.id}
            style={{ width: barWidth(h.level) }}
            className={cn(
              "h-0.5 shrink-0 rounded-full transition-colors duration-(--dur-fast)",
              h.id === activeId ? "bg-ink-secondary" : "bg-ink-faint/50",
            )}
          />
        ))}
      </div>

      {open ? (
        <div
          className={cn(
            "absolute top-1/2 right-2 max-h-[60vh] w-60 -translate-y-1/2 overflow-y-auto",
            "rounded-lg bg-popover p-1.5 shadow-md ring-1 ring-foreground/10",
            "animate-in fade-in-0 zoom-in-95 duration-100",
          )}
        >
          {headings.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => jump(h.id)}
              style={{ paddingLeft: `${8 + (h.level - 1) * 14}px` }}
              className={cn(
                "block w-full truncate rounded-sm py-1 pr-2 text-left text-[13px]",
                "transition-colors duration-(--dur-fast)",
                h.id === activeId
                  ? "bg-hover-wash-strong text-ink"
                  : "text-ink-muted hover:bg-hover-wash hover:text-ink",
              )}
            >
              {h.text || t("tree.untitled")}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
