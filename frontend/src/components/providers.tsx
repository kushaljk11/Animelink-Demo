"use client";

import { ThemeProvider, useTheme } from "next-themes";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { SWRConfig } from "swr";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fetcher } from "@/lib/api";
import { I18nProvider } from "@/lib/i18n/context";
import type { Lang } from "@/lib/i18n/dictionaries";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === "light" ? "light" : "dark"}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{ classNames: { toast: "!rounded-xl !border-border !shadow-pop" } }}
    />
  );
}

export function Providers({ children, lang }: { children: ReactNode; lang: Lang }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <SWRConfig value={{ fetcher, revalidateOnFocus: false, shouldRetryOnError: false }}>
        <TooltipProvider delayDuration={150}>
          <I18nProvider initialLang={lang}>{children}</I18nProvider>
          <ThemedToaster />
        </TooltipProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
