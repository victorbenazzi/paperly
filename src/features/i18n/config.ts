import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ptBR from "./locales/pt-BR.json";

export const SUPPORTED_LANGUAGES = [
  { id: "en", native: "English" },
  { id: "pt-BR", native: "Português" },
] as const;

export type LanguageId = (typeof SUPPORTED_LANGUAGES)[number]["id"];

const STORAGE_KEY = "paperly:language";

function readStored(): LanguageId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "pt-BR") return v;
  } catch {
    // ignore
  }
  return null;
}

const initialLanguage: LanguageId = readStored() ?? "en";
document.documentElement.lang = initialLanguage;

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "pt-BR": { translation: ptBR },
  },
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // ignore
  }
  document.documentElement.lang = lng;
});

export default i18n;
