import { PawPrint, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/portal/LoginForm";
import { getServerSession } from "@/lib/server-api";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { lang } = await getT();
  const safeNext = next && next.startsWith("/app") ? next : "/app/dashboard";
  if (await getServerSession()) redirect(safeNext);
  const showDemo = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_ROLE_SWITCHER === "true";
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-20 lg:grid-cols-2 lg:items-start lg:gap-24">
      <div className="max-w-lg rounded-3xl bg-[color-mix(in_oklab,var(--success)_7%,var(--bg))] p-8 sm:p-10 lg:pt-10">
        <span className="inline-flex items-center gap-2 rounded-full border border-success/25 bg-success/10 px-4 py-2 text-sm font-medium text-success"><PawPrint className="size-4" /> Rabies Track Nepal</span>
        <h2 className="mt-6 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">{lang === "ne" ? "जोडिएको हेरचाह, राम्रो हेरचाह।" : "Care is better connected."}</h2>
        <p className="mt-5 text-lg leading-relaxed text-muted">{lang === "ne" ? "पाल्तु जनावरको अभिलेख, खोपको जानकारी र सामुदायिक रिपोर्टिङ एकै ठाउँमा।" : "Access the tools that bring pet records, vaccination information and community reporting together."}</p>
        <p className="mt-8 flex items-center gap-3 text-sm text-fg-soft"><ShieldCheck className="size-5 text-success" /> {lang === "ne" ? "जनावर र समुदायको स्वास्थ्यका लागि तपाईंको कार्यस्थल" : "Your workspace for animal and community health"}</p>
      </div>
      <div className="w-full max-w-md lg:ml-auto"><LoginForm next={safeNext} showDemo={showDemo} /></div>
    </div>
  );
}
