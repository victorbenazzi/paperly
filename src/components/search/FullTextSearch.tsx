import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Search as SearchIcon } from "lucide-react";

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import type { SearchMatch } from "@/lib/ipc";
import { useSearchStore } from "@/features/search/search.store";
import { useVaultsStore, activeVault } from "@/features/vaults/vaults.store";
import { useNavStore } from "@/features/nav/nav.store";
import { useTreeStore } from "@/features/tree/tree.store";
import { stripMdExt } from "@/features/tree/tree.types";

const SEARCH_DEBOUNCE_MS = 300;

/** The matched line with the match itself emphasized (UTF-16 offsets from Rust). */
function MatchLine({ m }: { m: SearchMatch }) {
  const valid = m.start < m.end && m.end <= m.lineText.length;
  if (!valid) return <>{m.lineText}</>;
  return (
    <>
      {m.lineText.slice(0, m.start)}
      <span className="font-semibold text-accent">{m.lineText.slice(m.start, m.end)}</span>
      {m.lineText.slice(m.end)}
    </>
  );
}

export function FullTextSearch() {
  const { t } = useTranslation();
  const open = useSearchStore((s) => s.fullTextSearchOpen);
  const close = useSearchStore((s) => s.closeFullTextSearch);
  const query = useSearchStore((s) => s.fullTextQuery);
  const setQuery = useSearchStore((s) => s.setFullTextQuery);
  const results = useSearchStore((s) => s.fullTextResults);
  const searching = useSearchStore((s) => s.fullTextSearching);
  const error = useSearchStore((s) => s.fullTextError);
  const runSearch = useSearchStore((s) => s.runFullTextSearch);
  const vault = useVaultsStore((s) => activeVault(s));
  const openNote = useNavStore((s) => s.open);
  const select = useTreeStore((s) => s.select);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !vault || !query.trim()) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void runSearch(vault.id);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [query, open, vault, runSearch]);

  const handleSelect = (path: string) => {
    openNote(path);
    select(path);
    close();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={t("search.fullText")}
      description={t("search.fullTextHint")}
      shouldFilter={false}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t("search.fullTextPlaceholder")}
      />
      <CommandList>
        {searching ? (
          <div className="py-6 text-center text-sm text-ink-muted">{t("search.searching")}</div>
        ) : error ? (
          <div className="py-6 text-center text-sm text-danger">
            {t("search.error", { message: error })}
          </div>
        ) : results && results.files.length > 0 ? (
          <>
            {results.files.map((file) => {
              const name = stripMdExt(file.path.split("/").pop() ?? "");
              return (
                <CommandGroup key={file.path} heading={name}>
                  {file.matches.slice(0, 5).map((m, i) => (
                    <CommandItem
                      key={`${file.path}:${m.line}:${i}`}
                      value={`${file.path}:${m.line}:${i}`}
                      onSelect={() => handleSelect(file.path)}
                    >
                      <FileText size={14} className="shrink-0 text-ink-muted" />
                      <span className="truncate font-mono text-xs">
                        <MatchLine m={m} />
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-ink-faint">
                        :{m.line}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
            <div className="px-3 py-2 text-xs text-ink-faint">
              {t("search.matchCount", { count: results.totalMatches, ms: results.elapsedMs })}
              {results.truncated ? ` (${t("search.truncated")})` : ""}
            </div>
          </>
        ) : query.trim() ? (
          <CommandEmpty>{t("search.noResults")}</CommandEmpty>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-ink-faint">
            <SearchIcon size={20} />
            <span className="text-sm">{t("search.fullTextHint")}</span>
          </div>
        )}
      </CommandList>
    </CommandDialog>
  );
}
