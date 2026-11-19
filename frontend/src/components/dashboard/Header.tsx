"use client";

import { ChevronRight, Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/primitives";
import { useSession } from "@/lib/client/session";
import { navFor } from "@/lib/nav";
import { LanguageToggle } from "@/components/site/LanguageToggle";
import { useI18n } from "@/lib/i18n/context";
import { CommandMenu } from "./CommandMenu";
import { NotificationsPopover, RoleSwitcher, ThemeToggle, UserMenu } from "./HeaderControls";

function useBreadcrumb() {
  const pathname = usePathname();
  const session = useSession();
  const { navLabel } = useI18n();
  for (const g of navFor(session.role, navLabel)) {
    for (const i of g.items) {
      if (pathname === i.href || pathname.startsWith(`${i.href}/`)) {
        return { group: g.label, label: i.label, href: i.href, detail: pathname !== i.href };
      }
    }
  }
  return { group: navLabel("Overview"), label: navLabel("Dashboard"), href: "/app/dashboard", detail: false };
}

export function Header({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const crumb = useBreadcrumb();
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-[900] flex h-14 shrink-0 items-center gap-2 border-b border-border bg-bg/80 px-3 backdrop-blur-md sm:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
        <Menu />
      </Button>

      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
        <span className="text-muted">{crumb.group}</span>
        <ChevronRight className="size-3.5 text-muted/60" />
        <Link href={crumb.href} className="truncate font-medium text-fg hover:underline">
          {crumb.label}
        </Link>
        {crumb.detail && (
          <>
            <ChevronRight className="size-3.5 text-muted/60" />
            <span className="text-muted">Details</span>
          </>
        )}
      </nav>

      <button
        onClick={() => setPaletteOpen(true)}
        className="ml-auto flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted shadow-card transition hover:border-border-strong hover:text-fg sm:w-72"
        aria-label="Open command palette"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-left">{t("nav.search")}</span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="flex items-center gap-1">
        <RoleSwitcher />
        <LanguageToggle persist className="hidden sm:flex" />
        <ThemeToggle />
        <NotificationsPopover />
        <UserMenu />
      </div>

      <CommandMenu open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
