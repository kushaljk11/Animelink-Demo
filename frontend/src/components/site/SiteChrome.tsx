import { Phone } from "lucide-react";
import Link from "next/link";
import { BrandName, Logo } from "@/components/dashboard/Brand";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { getServerSession } from "@/lib/server-api";
import { PublicNavigation } from "./PublicNavigation";

export async function SiteHeader() {
  const user = await getServerSession();
  return <PublicNavigation signedIn={!!user} />;
}

export async function SiteFooter() {
  const { t } = await getT();
  const cols: { title: string; links: { href: string; key: MessageKey }[] }[] = [
    { title: "Citizens", links: [{ href: "/submit", key: "nav.report" }, { href: "/track", key: "nav.track" }, { href: "/lost", key: "nav.lost" }] },
    { title: "Partners", links: [{ href: "/nearby", key: "nav.nearby" }, { href: "/register", key: "nav.createAccount" }, { href: "/login", key: "nav.signIn" }] },
    { title: "Project", links: [{ href: "/about", key: "nav.about" }, { href: "/features", key: "nav.features" }, { href: "/blog", key: "nav.blog" }, { href: "/contact", key: "nav.contact" }] },
  ];
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-2 lg:grid-cols-5">
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
