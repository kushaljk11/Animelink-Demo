"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandName, Logo } from "@/components/dashboard/Brand";
import { ThemeToggle } from "@/components/dashboard/HeaderControls";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { LanguageToggle } from "./LanguageToggle";

const primary: { href: string; key: MessageKey }[] = [
  { href: "/", key: "nav.home" }, { href: "/features", key: "nav.features" },
  { href: "/about", key: "nav.about" }, { href: "/blog", key: "nav.blog" },
  { href: "/contact", key: "nav.contact" },
];
const services: { href: string; key: MessageKey }[] = [
  { href: "/track", key: "nav.track" }, { href: "/nearby", key: "nav.nearby" }, { href: "/lost", key: "nav.lost" },
];

export function PublicNavigation({ signedIn }: { signedIn: boolean }) {
  const { t, lang } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const serviceLabel = lang === "ne" ? "सेवाहरू" : "Services";
  const item = (l: { href: string; key: MessageKey }) => <Link key={l.href} href={l.href} onClick={(event) => { setOpen(false); event.currentTarget.closest("details")?.removeAttribute("open"); }} aria-current={pathname === l.href ? "page" : undefined} className="rounded-lg px-3 py-2 text-sm font-medium text-fg-soft transition hover:bg-surface-2 hover:text-fg aria-[current=page]:text-success">{t(l.key)}</Link>;
  return <header className="sticky top-0 z-[900] border-b border-border bg-surface/95 backdrop-blur-xl">
    <div className="mx-auto flex h-[76px] max-w-7xl items-center gap-5 px-5 sm:px-8">
      <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label={t("nav.home")}><Logo className="size-10 rounded-xl bg-success text-white" /><BrandName /></Link>
      <nav aria-label="Primary navigation" className="ml-auto hidden items-center gap-0.5 xl:flex">
        {primary.map(item)}
        <details className="group relative" onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.removeAttribute("open"); event.currentTarget.querySelector("summary")?.focus(); } }}><summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-fg-soft hover:bg-surface-2 [&::-webkit-details-marker]:hidden">{serviceLabel}<ChevronDown className="size-4 transition group-open:rotate-180" /></summary><div className="absolute right-0 top-full mt-2 flex w-64 flex-col rounded-2xl border border-border bg-surface p-2 shadow-pop">{services.map(item)}</div></details>
      </nav>
      <div className="ml-auto hidden items-center gap-2 xl:ml-0 xl:flex"><LanguageToggle /><ThemeToggle /><Link className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-fg hover:bg-surface-2" href={signedIn ? "/app/dashboard" : "/login"}>{t(signedIn ? "nav.dashboard" : "nav.signIn")}</Link><Link href="/submit" className="whitespace-nowrap rounded-xl bg-[#126c5b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0c5548]">{t("nav.report")}</Link></div>
      <div className="ml-auto flex items-center gap-2 xl:hidden"><LanguageToggle className="hidden sm:flex" /><ThemeToggle /><button type="button" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-navigation" className="flex size-11 items-center justify-center rounded-xl border border-border text-fg">{open ? <X /> : <Menu />}</button></div>
    </div>
    {open && <nav id="mobile-navigation" aria-label="Mobile navigation" className="max-h-[calc(100dvh-76px)] overflow-y-auto border-t border-border bg-surface px-5 py-5 shadow-pop xl:hidden"><div className="mx-auto flex max-w-2xl flex-col">{primary.map(item)}<p className="px-3 pb-2 pt-5 text-xs font-semibold uppercase tracking-widest text-muted">{serviceLabel}</p>{services.map(item)}<div className="mt-4 flex items-center justify-between px-3 sm:hidden"><span className="text-sm font-medium text-fg-soft">{t("lang.switch")}</span><LanguageToggle /></div><div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-5"><Link onClick={() => setOpen(false)} href={signedIn ? "/app/dashboard" : "/login"} className="rounded-xl border border-border px-4 py-3 text-center text-sm font-semibold">{t(signedIn ? "nav.dashboard" : "nav.signIn")}</Link><Link onClick={() => setOpen(false)} href="/submit" className="rounded-xl bg-[#126c5b] px-4 py-3 text-center text-sm font-semibold text-white">{t("nav.report")}</Link></div></div></nav>}
  </header>;
}
