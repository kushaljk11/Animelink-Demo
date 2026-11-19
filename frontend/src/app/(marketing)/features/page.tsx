import { ClipboardList, HeartPulse, MapPin, PawPrint, QrCode, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Features", description: "Explore the tools in Rabies Track Nepal." };

export default async function FeaturesPage() {
  const { lang } = await getT();
  const ne = lang === "ne";
  const features = [
    { icon: ClipboardList, title: ne ? "घटना रिपोर्ट र ट्र्याकिङ" : "Report and follow incidents", body: ne ? "घटना रिपोर्ट गर्नुहोस् र ट्र्याकिङ कोड प्रयोग गरी यसको अवस्था हेर्नुहोस्।" : "Submit an incident report and use its tracking code to follow its status.", href: "/submit", action: ne ? "रिपोर्ट गर्नुहोस्" : "Report an incident" },
    { icon: PawPrint, title: ne ? "पाल्तु जनावरको विवरण" : "Pet profiles", body: ne ? "पाल्तु जनावरको पहिचान र स्वास्थ्य विवरण एकै ठाउँमा राख्नुहोस्।" : "Keep pet identity and health details together in one place.", href: "/register", action: ne ? "खाता खोल्नुहोस्" : "Create an account" },
    { icon: HeartPulse, title: ne ? "खोप अभिलेख" : "Vaccination records", body: ne ? "खोपको अभिलेख र बुस्टर रिमाइन्डरबाट हेरचाहको जानकारी राख्नुहोस्।" : "Keep track of vaccination records and booster reminders.", href: "/register", action: ne ? "सुरु गर्नुहोस्" : "Get started" },
    { icon: MapPin, title: ne ? "नजिकका सेवाहरू" : "Find nearby services", body: ne ? "नजिकका भेटेरिनरी क्लिनिक र उद्धार संस्थाहरू खोज्नुहोस्।" : "Explore nearby veterinary clinics and rescue organisations.", href: "/nearby", action: ne ? "नजिकका सेवाहरू" : "Explore the map" },
    { icon: QrCode, title: ne ? "डिजिटल पहिचान" : "Digital pet identity", body: ne ? "QR पहिचानले पाल्तु जनावरको सार्वजनिक प्रोफाइलमा पहुँच दिन्छ।" : "QR identification connects a pet to its public profile.", href: "/lost", action: ne ? "हराएका जनावर" : "View lost pets" },
    { icon: ShieldCheck, title: ne ? "समुदायको हेरचाह" : "Community care", body: ne ? "समुदायका जनावर र घटनाहरूको जानकारी व्यवस्थापन गर्न साझेदारहरूलाई सहयोग गर्नुहोस्।" : "Support partners managing community animal records and incident information.", href: "/about", action: ne ? "हाम्रो बारेमा" : "About the project" },
  ];
  return <div>
    <section className="border-b border-border bg-[color-mix(in_oklab,var(--success)_6%,var(--bg))]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:py-24"><p className="text-sm font-semibold uppercase tracking-widest text-success">Rabies Track Nepal</p><h1 className="mt-5 max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">{ne ? "जनावर र समुदायको हेरचाहका लागि सरल उपकरणहरू।" : "Better tools for animal and community health."}</h1><p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{ne ? "रिपोर्टिङदेखि खोप अभिलेखसम्म, आवश्यक जानकारी र सेवाहरू एकै ठाउँमा।" : "From reporting to vaccination records, bring the information and services you need together."}</p></div>
    </section>
    <section className="mx-auto max-w-6xl px-4 py-20"><div className="mb-10 max-w-2xl"><p className="text-sm font-semibold uppercase tracking-widest text-success">{ne ? "हाम्रा सुविधाहरू" : "What you can do"}</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">{ne ? "हरेक चरणमा जोडिएको हेरचाह" : "Connected care, step by step"}</h2></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map(({icon: Icon, ...f}) => <article key={f.href + f.title} className="public-service group flex flex-col"><span className="flex size-12 items-center justify-center rounded-xl bg-success/10 text-success"><Icon className="size-6" /></span><h3 className="mt-6 text-xl font-semibold">{f.title}</h3><p className="mt-3 flex-1 leading-relaxed text-muted">{f.body}</p><Link className="public-text-link mt-7 w-fit" href={f.href}>{f.action}</Link></article>)}</div></section>
  </div>;
}
