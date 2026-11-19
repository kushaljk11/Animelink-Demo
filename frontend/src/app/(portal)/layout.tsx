import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

export const dynamic = "force-dynamic";

/** Citizen tools (report, track, nearby, lost, sign-in): same navbar and footer as the marketing site. */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
