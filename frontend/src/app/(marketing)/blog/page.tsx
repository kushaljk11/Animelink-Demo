import { BookOpen, MessageCircle } from "lucide-react";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Blog", description: "Updates from Rabies Track Nepal." };

export default async function BlogPage() {
  const { lang } = await getT();
  const ne = lang === "ne";
  return <div>
    <section className="border-b border-border bg-[color-mix(in_oklab,var(--success)_6%,var(--bg))]"><div className="mx-auto max-w-6xl px-4 py-20 sm:py-24"><p className="text-sm font-semibold uppercase tracking-widest text-success">Rabies Track Nepal</p><h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">{ne ? "समाचार र जानकारी" : "Stories & updates"}</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{ne ? "परियोजनाका समाचार र जानकारी यहाँ उपलब्ध हुनेछन्।" : "A space for news and information from the project."}</p></div></section>
    <section className="mx-auto max-w-6xl px-4 py-20"><div className="grid gap-8 rounded-3xl border border-border bg-surface p-8 sm:p-12 md:grid-cols-[1fr_2fr] md:items-center"><div className="flex min-h-48 items-center justify-center rounded-2xl bg-success/10 text-success"><BookOpen className="size-16" strokeWidth={1.2} /></div><div><p className="text-sm font-semibold uppercase tracking-widest text-success">{ne ? "ब्लग" : "From the project"}</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">{ne ? "अहिलेसम्म कुनै लेख प्रकाशित भएको छैन" : "No articles published yet"}</h2><p className="mt-4 max-w-xl leading-relaxed text-muted">{ne ? "अहिलेलाई परियोजनाको बारेमा जान्नुहोस् वा हामीलाई सम्पर्क गर्नुहोस्।" : "In the meantime, learn more about the project or get in touch with the team."}</p><div className="mt-7 flex flex-wrap gap-3"><Link href="/about" className="public-button public-button-primary">{ne ? "हाम्रो बारेमा" : "About the project"}</Link><Link href="/contact" className="public-button public-button-outline gap-2"><MessageCircle className="size-4" />{ne ? "सम्पर्क" : "Contact us"}</Link></div></div></div></section>
  </div>;
}
