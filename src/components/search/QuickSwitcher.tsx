import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { CMD, ipc } from "@/lib/ipc";
import { fuzzyFilter } from "@/lib/fuzzy";
import { useSearchStore } from "@/features/search/search.store";
import { useVaultsStore, activeVault } from "@/features/vaults/vaults.store";
import { useNavStore } from "@/features/nav/nav.store";
import { useTreeStore } from "@/features/tree/tree.store";
import { stripMdExt, isMarkdown } from "@/features/tree/tree.types";

function relativeToVault(path: string, root: string): string {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

export function QuickSwitcher() {
  const { t } = useTranslation();
  const open = useSearchStore((s) => s.quickSwitcherOpen);
  const close = useSearchStore((s) => s.closeQuickSwitcher);
  const vault = useVaultsStore((s) => activeVault(s));
  const openNote = useNavStore((s) => s.open);
  const select = useTreeStore((s) => s.select);

  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !vault) return;
    let cancelled = false;
    void ipc<string[]>(CMD.listFiles, { vaultId: vault.id, max: 5000 }).then((list) => {
      if (!cancelled) setFiles(list.filter((f) => isMarkdown(f.split("/").pop() ?? "")));
    });
    return () => {
      cancelled = true;
    };
  }, [open, vault]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const results = useMemo(() => {
    if (!vault) return [];
    const root = vault.path;
    return fuzzyFilter(files, query, (f) => stripMdExt(relativeToVault(f, root)));
  }, [files, query, vault]);

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
      title={t("search.quickSwitcher")}
      description={t("search.quickSwitcherHint")}
      shouldFilter={false}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t("search.quickSwitcherPlaceholder")}
      />
      <CommandList>
        <CommandEmpty>{t("search.noResults")}</CommandEmpty>
        <CommandGroup>
          {results.map(({ item: path }) => {
            const name = stripMdExt(path.split("/").pop() ?? "");
            const rel = vault ? relativeToVault(path, vault.path) : path;
            return (
              <CommandItem
                key={path}
                value={path}
                onSelect={() => handleSelect(path)}
              >
                <FileText size={14} className="shrink-0 text-ink-muted" />
                <span className="truncate">{name}</span>
                <span className="ml-auto truncate text-xs text-ink-faint">{rel}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
