import { LayoutDashboard, LogIn, Phone, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { BrandName, Logo } from "@/components/dashboard/Brand";
import { ThemeToggle } from "@/components/dashboard/HeaderControls";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { getServerSession } from "@/lib/server-api";
import { LanguageToggle } from "./LanguageToggle";

const LINKS: { href: string; key: MessageKey }[] = [
  { href: "/about", key: "nav.about" },
  { href: "/track", key: "nav.track" },
  { href: "/nearby", key: "nav.nearby" },
  { href: "/lost", key: "nav.lost" },
  { href: "/contact", key: "nav.contact" },
];

/** Public navbar shared by the marketing site and the citizen portal (report, track, nearby, lost). */
export async function SiteHeader() {
  const [{ t }, user] = await Promise.all([getT(), getServerSession()]);
  return (
    <header className="sticky top-0 z-[900] border-b border-border bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label={t("nav.home")}>
          <Logo />
          <BrandName className="hidden sm:flex" />
        </Link>
        <nav className="ml-3 hidden items-center gap-0.5 lg:flex" aria-label="Site">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-2.5 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-fg">
              {t(l.key)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <LanguageToggle />
          <ThemeToggle />
          <Button asChild variant="danger" size="sm" className="hidden md:inline-flex">
            <Link href="/submit">
              <ShieldAlert /> {t("nav.report")}
            </Link>
          </Button>
          {user ? (
            <Button asChild variant="primary" size="sm">
              <Link href="/app/dashboard">
                <LayoutDashboard /> <span className="hidden sm:inline">{t("nav.dashboard")}</span>
              </Link>
            </Button>
          ) : (
            <Button asChild variant="secondary" size="sm">
              <Link href="/login">
                <LogIn /> <span className="hidden sm:inline">{t("nav.signIn")}</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
      <nav className="scroll-thin flex gap-1 overflow-x-auto border-t border-border px-3 py-1.5 lg:hidden" aria-label="Site (mobile)">
        <Link href="/submit" className="whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10 md:hidden">
          {t("nav.report")}
        </Link>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-md px-2.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg">
            {t(l.key)}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export async function SiteFooter() {
  const { t } = await getT();
  const cols: { title: string; links: { href: string; key: MessageKey }[] }[] = [
    { title: "Citizens", links: [{ href: "/submit", key: "nav.report" }, { href: "/track", key: "nav.track" }, { href: "/lost", key: "nav.lost" }] },
    { title: "Partners", links: [{ href: "/nearby", key: "nav.nearby" }, { href: "/register", key: "nav.createAccount" }, { href: "/login", key: "nav.signIn" }] },
    { title: "Project", links: [{ href: "/about", key: "nav.about" }, { href: "/contact", key: "nav.contact" }] },
  ];
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <BrandName />
          </Link>
          <p className="max-w-sm text-sm text-muted">{t("brand.tagline")}</p>
          <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 p-3 text-xs font-medium text-fg-soft">
            <Phone className="mt-0.5 size-3.5 shrink-0 text-danger" /> {t("footer.firstAid")}
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{c.title}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-fg-soft hover:text-fg">
                    {t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-muted sm:flex-row sm:justify-between">
          <p>{t("footer.disclaimer")}</p>
          <p>{t("footer.rights")}</p>
        </div>
      </div>
    </footer>
  );
}
