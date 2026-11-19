import { redirect } from "next/navigation";
import { LoginForm } from "@/components/portal/LoginForm";
import { getServerSession } from "@/lib/server-api";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/app") ? next : "/app/dashboard";
  if (await getServerSession()) redirect(safeNext);
  const showDemo = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_ROLE_SWITCHER === "true";
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-20">
      <LoginForm next={safeNext} showDemo={showDemo} />
    </div>
  );
}
