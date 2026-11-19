"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { LANG_COOKIE, NAV_NE, translate, type Lang, type MessageKey } from "./dictionaries";

type I18n = {
  lang: Lang;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** Translate a navigation label (English label from lib/nav.ts). */
  navLabel: (label: string) => string;
  setLang: (lang: Lang) => void;
};

const I18nContext = createContext<I18n | null>(null);

/** Language comes from the `rtn_lang` cookie (read on the server, so the first paint is already in the right language). */
export function I18nProvider({ initialLang, children }: { initialLang: Lang; children: ReactNode }) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      document.documentElement.lang = next === "ne" ? "ne" : "en";
      router.refresh(); // re-render server components (marketing pages) in the new language
    },
    [router],
  );

  const value = useMemo<I18n>(
    () => ({
      lang,
      t: (key, vars) => translate(lang, key, vars),
      navLabel: (label) => (lang === "ne" ? (NAV_NE[label] ?? label) : label),
      setLang,
    }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
