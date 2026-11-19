"use client";

import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import type { Lang } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

/** Segmented pill: EN | ने. With `persist`, a signed-in user's profile language is updated too. */
export function LanguageToggle({ persist, className }: { persist?: boolean; className?: string }) {
  const { lang, setLang, t } = useI18n();
  const choose = (next: Lang) => {
    if (next === lang) return;
    setLang(next);
    if (persist) void api("/auth/me", { method: "PATCH", body: { locale: next === "ne" ? "NE" : "EN" } }).catch(() => undefined);
  };
  const item = (value: Lang, label: string, aria: string) => (
    <button
      type="button"
      onClick={() => choose(value)}
      aria-pressed={lang === value}
      aria-label={aria}
      className={cn(
        "h-7 min-w-9 rounded-full px-2.5 text-xs font-semibold transition",
        lang === value ? "bg-fg text-bg shadow-card" : "text-muted hover:text-fg",
        value === "ne" && "font-deva text-[13px]",
      )}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label={t("lang.switch")} className={cn("flex items-center rounded-full border border-border bg-surface p-0.5", className)}>
      {item("en", "EN", "English")}
      {item("ne", "ने", "नेपाली")}
    </div>
  );
}
