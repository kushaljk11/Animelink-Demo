import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/portal/RegisterForm";
import { getServerSession } from "@/lib/server-api";

export const metadata = { title: "Create an account" };

export default async function RegisterPage() {
  if (await getServerSession()) redirect("/app/dashboard");
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <RegisterForm />
    </div>
  );
}
