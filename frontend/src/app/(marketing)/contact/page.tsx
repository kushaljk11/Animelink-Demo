import { Ambulance, Building, ChevronDown, Flame, Hospital, Phone, Shield, type LucideIcon } from "lucide-react";
import { ContactForm } from "@/components/marketing/ContactForm";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Contact & FAQ", description: "Contact the Rabies Track Nepal team, emergency helplines and frequently asked questions." };

// Nepal's national emergency short codes. Facility-specific numbers are deliberately not hardcoded:
// they change, and a wrong number in an emergency is worse than none.
const HELPLINES: { icon: LucideIcon; label: MessageKey; number?: string; body?: MessageKey; tone: string }[] = [
  { icon: Ambulance, label: "contact.helpline.ambulance", number: "102", tone: "text-danger" },
  { icon: Shield, label: "contact.helpline.police", number: "100", tone: "text-info" },
  { icon: Flame, label: "contact.helpline.fire", number: "101", tone: "text-warning" },
  { icon: Hospital, label: "contact.helpline.hospital", body: "contact.helpline.hospitalBody", tone: "text-success" },
  { icon: Building, label: "contact.helpline.ward", body: "contact.helpline.wardBody", tone: "text-violet" },
];

const FAQ = [1, 2, 3, 4, 5, 6] as const;

export default async function ContactPage() {
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:py-24">
      <header className="max-w-2xl"><p className="public-eyebrow mb-4">Rabies Track Nepal</p>
        <h1 className="text-4xl font-semibold tracking-tight text-fg sm:text-6xl">{t("contact.title")}</h1>
        <p className="mt-3 text-lg text-muted">{t("contact.lead")}</p>
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-9" aria-labelledby="form-title">
          <h2 id="form-title" className="mb-5 text-lg font-semibold text-fg">{t("contact.form.title")}</h2>
          <ContactForm />
        </section>

        <aside className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-9" aria-labelledby="helplines">
          <h2 id="helplines" className="flex items-center gap-2 text-lg font-semibold text-fg">
            <Phone className="size-5 text-danger" /> {t("contact.helplines")}
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {HELPLINES.map((h) => (
              <li key={h.label} className="flex items-start gap-3 py-3">
                <h.icon className={`mt-0.5 size-5 shrink-0 ${h.tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{t(h.label)}</p>
                  {h.body && <p className="text-xs leading-relaxed text-muted">{t(h.body)}</p>}
                </div>
                {h.number && (
                  <a href={`tel:${h.number}`} className="rounded-lg border border-border px-3 py-1 font-mono text-sm font-semibold text-fg transition hover:border-border-strong">
                    {h.number}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <section className="mt-16 max-w-4xl" aria-labelledby="faq">
        <h2 id="faq" className="text-2xl font-semibold tracking-tight text-fg">{t("contact.faq")}</h2>
        <div className="mt-6 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {FAQ.map((n) => (
            <details key={n} className="group" open={n === 1}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-medium text-fg transition hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                {t(`faq.${n}.q` as MessageKey)}
                <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{t(`faq.${n}.a` as MessageKey)}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
