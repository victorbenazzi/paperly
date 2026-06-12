import { create } from "zustand";

import { CMD, ipc, errorMessage, type SearchResults, type SearchOptions } from "@/lib/ipc";

/**
 * Monotonic token per search request: a response only lands if it is still
 * the latest one, so slow earlier queries can't overwrite newer results.
 */
let searchSeq = 0;

const idleFullText = {
  fullTextQuery: "",
  fullTextResults: null,
  fullTextSearching: false,
  fullTextError: null,
} as const;

interface SearchState {
  quickSwitcherOpen: boolean;
  fullTextSearchOpen: boolean;

  fullTextQuery: string;
  fullTextResults: SearchResults | null;
  fullTextSearching: boolean;
  fullTextError: string | null;

  openQuickSwitcher: () => void;
  closeQuickSwitcher: () => void;
  toggleQuickSwitcher: () => void;

  openFullTextSearch: () => void;
  closeFullTextSearch: () => void;
  toggleFullTextSearch: () => void;

  setFullTextQuery: (q: string) => void;
  runFullTextSearch: (vaultId: string, options?: SearchOptions) => Promise<void>;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  quickSwitcherOpen: false,
  fullTextSearchOpen: false,
  ...idleFullText,

  openQuickSwitcher: () => set({ quickSwitcherOpen: true }),
  closeQuickSwitcher: () => set({ quickSwitcherOpen: false }),
  toggleQuickSwitcher: () => set((s) => ({ quickSwitcherOpen: !s.quickSwitcherOpen })),

  openFullTextSearch: () => set({ fullTextSearchOpen: true }),
  closeFullTextSearch: () => {
    searchSeq++;
    set({ fullTextSearchOpen: false, ...idleFullText });
  },
  toggleFullTextSearch: () => {
    if (get().fullTextSearchOpen) get().closeFullTextSearch();
    else get().openFullTextSearch();
  },

  setFullTextQuery: (q) => {
    searchSeq++; // typing invalidates any in-flight response
    if (!q.trim()) set({ fullTextQuery: q, fullTextResults: null, fullTextSearching: false, fullTextError: null });
    else set({ fullTextQuery: q });
  },

  runFullTextSearch: async (vaultId, options) => {
    const query = get().fullTextQuery;
    if (!query.trim()) return;
    const seq = ++searchSeq;
    set({ fullTextSearching: true, fullTextError: null });
    try {
      const results = await ipc<SearchResults>(CMD.searchInVault, {
        vaultId,
        query,
        options: options ?? null,
      });
      if (seq !== searchSeq) return;
      set({ fullTextResults: results, fullTextSearching: false });
    } catch (err) {
      if (seq !== searchSeq) return;
      set({ fullTextResults: null, fullTextSearching: false, fullTextError: errorMessage(err) });
    }
  },
}));
