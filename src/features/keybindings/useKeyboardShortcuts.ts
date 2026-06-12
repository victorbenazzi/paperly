import { useEffect } from "react";

import { useSearchStore } from "@/features/search/search.store";

export function useKeyboardShortcuts() {
  const toggleQuickSwitcher = useSearchStore((s) => s.toggleQuickSwitcher);
  const toggleFullTextSearch = useSearchStore((s) => s.toggleFullTextSearch);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "p" && !e.shiftKey) {
        e.preventDefault();
        toggleQuickSwitcher();
      } else if (mod && e.shiftKey && e.key === "F") {
        e.preventDefault();
        toggleFullTextSearch();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleQuickSwitcher, toggleFullTextSearch]);
}
