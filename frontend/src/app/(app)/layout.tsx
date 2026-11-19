import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { getServerSession } from "@/lib/server-api";

export const dynamic = "force-dynamic";

/** Authenticated surface: the session is resolved by the API (GET /auth/me) so the shell renders without a loading flash. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login?next=/app/dashboard");
  return <AppShell session={session}>{children}</AppShell>;
}
