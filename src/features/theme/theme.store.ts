import { create } from "zustand";

export type ThemeMode = "system" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";

interface ThemeState {
  /** User-chosen light/dark preference (or "system" to follow the OS). */
  mode: ThemeMode;
  /** Resolved kind currently applied to the document. */
  effective: EffectiveTheme;

  setMode: (mode: ThemeMode) => void;
  /** Recompute the effective theme from the current OS preference (no-op when
   *  mode is "light" or "dark"). */
  refresh: () => void;
}

function readSystemTheme(): EffectiveTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveEffective(mode: ThemeMode): EffectiveTheme {
  return mode === "system" ? readSystemTheme() : mode;
}

function applyTheme(effective: EffectiveTheme) {
  document.documentElement.setAttribute("data-theme", effective);
}

const MODE_KEY = "noteflow:theme";

function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // localStorage may be unavailable in some contexts; fall through
  }
  return "system";
}

function writeStored(mode: ThemeMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // ignore
  }
}

// First-paint resolution runs synchronously at module load so the cascade is
// correct before React mounts: no theme flash.
const initialMode = readStoredMode();
const initialEffective = resolveEffective(initialMode);
applyTheme(initialEffective);

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initialMode,
  effective: initialEffective,

  setMode: (mode) => {
    const effective = resolveEffective(mode);
    applyTheme(effective);
    writeStored(mode);
    set({ mode, effective });
  },

  refresh: () => {
    const state = get();
    if (state.mode !== "system") return;
    const effective = readSystemTheme();
    if (effective === state.effective) return;
    applyTheme(effective);
    set({ effective });
  },
}));

/** Wire OS theme listener once at startup. */
export function initThemeListener() {
  if (typeof window === "undefined" || !window.matchMedia) return;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => useThemeStore.getState().refresh();
  if (mq.addEventListener) mq.addEventListener("change", handler);
  else mq.addListener(handler);
}
