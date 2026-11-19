import {
  Accessibility,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  EyeOff,
  HeartHandshake,
  MapPin,
  MessageSquareText,
  PawPrint,
  ScrollText,
  Server,
  ShieldAlert,
  Smartphone,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { MilestoneMap } from "@/components/marketing/MilestoneMap";
import { Assistant } from "@/components/portal/Assistant";
import { Button } from "@/components/ui/button";
import { formatBS } from "@/lib/dates";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { getT } from "@/lib/i18n/server";
import { serverApi } from "@/lib/server-api";
import { cn, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PublicStats = { verifiedClinics: number; verifiedShelters: number; activeLostPets: number; incidentsLast30Days: number; cnvrLast30Days: number };

const STEPS: { n: string; icon: LucideIcon; title: MessageKey; body: MessageKey; tone: string }[] = [
  { n: "01", icon: MapPin, title: "steps.1.title", body: "steps.1.body", tone: "text-danger bg-danger/10 border-danger/25" },
  { n: "02", icon: Smartphone, title: "steps.2.title", body: "steps.2.body", tone: "text-info bg-info/10 border-info/25" },
  { n: "03", icon: CheckCircle2, title: "steps.3.title", body: "steps.3.body", tone: "text-success bg-success/10 border-success/25" },
];

const TRUST: { icon: LucideIcon; title: MessageKey; body: MessageKey }[] = [
  { icon: EyeOff, title: "trust.privacy.title", body: "trust.privacy.body" },
  { icon: BadgeCheck, title: "trust.verified.title", body: "trust.verified.body" },
  { icon: ScrollText, title: "trust.audit.title", body: "trust.audit.body" },
  { icon: Accessibility, title: "trust.access.title", body: "trust.access.body" },
  { icon: MessageSquareText, title: "trust.sms.title", body: "trust.sms.body" },
  { icon: Server, title: "trust.offline.title", body: "trust.offline.body" },
];

export default async function Landing() {
  const [{ t }, stats] = await Promise.all([getT(), serverApi<PublicStats>("/public/stats")]);
  const v = (n: number | undefined) => (stats.ok && n !== undefined ? n.toLocaleString("en-US") : "—");
  const now = new Date();
  const kpis: { label: MessageKey; value: string; icon: LucideIcon; accent: string }[] = [
    { label: "kpi.reports", value: v(stats.data?.incidentsLast30Days), icon: ShieldAlert, accent: "text-danger" },
    { label: "kpi.cnvr", value: v(stats.data?.cnvrLast30Days), icon: HeartHandshake, accent: "text-violet" },
    { label: "kpi.clinics", value: v(stats.data?.verifiedClinics), icon: Stethoscope, accent: "text-success" },
    { label: "kpi.lost", value: v(stats.data?.activeLostPets), icon: PawPrint, accent: "text-warning" },
  ];

  return (
    <div>
      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_60%_at_15%_0%,color-mix(in_oklab,var(--danger)_14%,transparent),transparent),radial-gradient(45%_55%_at_90%_20%,color-mix(in_oklab,var(--info)_16%,transparent),transparent)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_55%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_55%,transparent)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(70%_60%_at_50%_30%,black,transparent)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-muted shadow-card backdrop-blur">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-success text-success" /> {t("hero.badge")}
            </p>
            <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-fg sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">{t("hero.title")}</h1>
            <p className="mt-5 max-w-xl text-pretty text-base text-muted sm:text-lg">{t("hero.subtitle")}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="danger" size="lg" className="shadow-[0_8px_30px_-8px_color-mix(in_oklab,var(--danger)_60%,transparent)]">
                <Link href="/submit">
                  <ShieldAlert /> {t("hero.ctaSubmit")}
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/track">
                  <ClipboardList /> {t("hero.ctaTrack")}
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted">{t("hero.noAccount")}</p>
          </div>

          {/* glassmorphic KPI preview */}
          <div className="relative">
            <div aria-hidden className="absolute -inset-6 rounded-[2rem] bg-[conic-gradient(from_200deg,color-mix(in_oklab,var(--danger)_30%,transparent),color-mix(in_oklab,var(--info)_30%,transparent),color-mix(in_oklab,var(--success)_25%,transparent),color-mix(in_oklab,var(--danger)_30%,transparent))] opacity-40 blur-3xl" />
            <div className="relative rounded-2xl border border-white/10 bg-surface/55 p-5 shadow-pop ring-1 ring-black/5 backdrop-blur-xl dark:bg-surface/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-fg">{t("kpi.title")}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDate(now)} <span className="text-muted/60">|</span>{" "}
                    <span className="font-deva" lang="ne">
                      {formatBS(now)}
                    </span>
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                  <span className="size-1.5 animate-pulse-dot rounded-full bg-success text-success" /> {t("kpi.live")}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {kpis.map((k) => (
                  <div key={k.label} className="rounded-xl border border-border/70 bg-bg/40 p-4">
                    <k.icon className={cn("size-4", k.accent)} />
                    <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-fg">{k.value}</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted">{t(k.label)}</p>
                  </div>
                ))}
              </div>
              <Link href="/track" className="mt-4 flex items-center justify-between rounded-xl border border-border/70 bg-bg/40 px-4 py-3 text-sm text-fg-soft transition hover:border-border-strong hover:text-fg">
                <span className="font-mono text-xs tracking-wider text-muted">NP-XXXX-XXXX</span>
                <span className="inline-flex items-center gap-1">
                  {t("nav.track")} <ArrowRight className="size-4" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- 3 steps */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20" aria-labelledby="how">
        <div className="max-w-2xl">
          <h2 id="how" className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{t("steps.title")}</h2>
          <p className="mt-2 text-muted">{t("steps.subtitle")}</p>
        </div>
        <ol className="relative mt-10 grid gap-4 md:grid-cols-3">
          <span aria-hidden className="absolute left-[16%] right-[16%] top-[2.35rem] hidden h-px bg-gradient-to-r from-danger/40 via-info/40 to-success/40 md:block" />
          {STEPS.map((s) => (
            <li key={s.n} className="relative rounded-2xl border border-border bg-surface p-6 shadow-card">
              <div className="flex items-center gap-3">
                <span className={cn("relative z-10 flex size-11 items-center justify-center rounded-xl border bg-surface", s.tone)}>
                  <s.icon className="size-5" />
                </span>
                <span className="font-mono text-xs text-muted">{s.n}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-fg">{t(s.title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(s.body)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ----------------------------------------------------------- map */}
      <section className="border-y border-border bg-surface/40" aria-labelledby="resolved">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <h2 id="resolved" className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{t("map.title")}</h2>
              <p className="mt-2 text-muted">{t("map.subtitle")}</p>
            </div>
            <Button asChild variant="ghost">
              <Link href="/nearby">
                {t("nav.nearby")} <ArrowRight />
              </Link>
            </Button>
          </div>
          <MilestoneMap />
        </div>
      </section>

      {/* ---------------------------------------------------------- trust */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20" aria-labelledby="trust">
        <div className="max-w-2xl">
          <h2 id="trust" className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{t("trust.title")}</h2>
          <p className="mt-2 text-muted">{t("trust.subtitle")}</p>
        </div>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {TRUST.map((f) => (
            <div key={f.title} className="bg-surface p-6">
              <f.icon className="size-5 text-accent" />
              <h3 className="mt-4 font-semibold text-fg">{t(f.title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(f.body)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------- owners + assistant */}
      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-20 lg:grid-cols-[1fr_1.3fr]">
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-[linear-gradient(135deg,color-mix(in_oklab,var(--success)_10%,var(--surface)),var(--surface))] p-6 shadow-card">
          <div>
            <PawPrint className="size-6 text-success" />
            <h2 className="mt-4 text-xl font-semibold text-fg">{t("owners.title")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t("owners.body")}</p>
          </div>
          <div className="mt-6">
            <Button asChild variant="primary">
              <Link href="/register">
                {t("owners.cta")} <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-fg">{t("assistant.title")}</h2>
          <p className="mb-4 text-sm text-muted">{t("assistant.subtitle")}</p>
          <Assistant compact />
        </div>
      </section>
    </div>
  );
}
