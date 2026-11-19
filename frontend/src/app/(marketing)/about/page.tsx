import { ArrowRight, Bot, Building2, Eye, FileDown, KeyRound, Mountain, ScrollText, Server, Target, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "About", description: "Mission, relevance to Nepal and technical principles of Rabies Track Nepal." };

const PRINCIPLES: { icon: LucideIcon; title: MessageKey; body: MessageKey }[] = [
  { icon: Eye, title: "about.principles.1.title", body: "about.principles.1.body" },
  { icon: KeyRound, title: "about.principles.2.title", body: "about.principles.2.body" },
  { icon: ScrollText, title: "about.principles.3.title", body: "about.principles.3.body" },
  { icon: Bot, title: "about.principles.4.title", body: "about.principles.4.body" },
  { icon: FileDown, title: "about.principles.5.title", body: "about.principles.5.body" },
  { icon: Server, title: "about.principles.6.title", body: "about.principles.6.body" },
];

export default async function AboutPage() {
  const { t } = await getT();
  return (
    <div>
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,var(--success)_6%,var(--bg))]" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-24"><p className="public-eyebrow">Rabies Track Nepal · One Health</p>
          <h1 className="mt-4 max-w-4xl text-balance text-4xl font-semibold tracking-tight text-fg sm:text-6xl">{t("about.title")}</h1>
          <p className="mt-5 max-w-2xl text-pretty text-lg text-muted">{t("about.lead")}</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16 lg:grid-cols-2">
        <article className="rounded-2xl border border-border bg-surface p-8 shadow-card">
          <Target className="size-6 text-danger" />
          <h2 className="mt-4 text-xl font-semibold text-fg">{t("about.mission.title")}</h2>
          <p className="mt-2 leading-relaxed text-muted">{t("about.mission.body")}</p>
        </article>
        <article className="rounded-2xl border border-border bg-surface p-7 shadow-card">
          <Mountain className="size-6 text-info" />
          <h2 className="mt-4 text-xl font-semibold text-fg">{t("about.why.title")}</h2>
          <ul className="mt-3 space-y-2.5">
            {(["about.why.1", "about.why.2", "about.why.3"] as const).map((k) => (
              <li key={k} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-info" /> {t(k)}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="border-y border-border bg-[color-mix(in_oklab,var(--success)_5%,var(--bg))]">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-fg">
            <Building2 className="size-6 text-success" /> {t("about.how.title")}
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {(["about.how.1", "about.how.2", "about.how.3"] as const).map((k, i) => (
              <li key={k} className="rounded-2xl border border-border bg-surface p-6">
                <span className="font-mono text-xs text-muted">0{i + 1}</span>
                <p className="mt-2 text-sm leading-relaxed text-fg-soft">{t(k)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{t("about.principles.title")}</h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="bg-surface p-6">
              <p.icon className="size-5 text-success" />
              <h3 className="mt-4 font-semibold text-fg">{t(p.title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(p.body)}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild variant="primary">
            <Link href="/submit">
              {t("about.cta")} <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/contact">{t("nav.contact")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
