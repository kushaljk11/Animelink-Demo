"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, Field, Input } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { ROLE_LABEL, type Role } from "@/lib/constants";

const schema = z.object({ email: z.string().trim().email("Enter a valid email"), password: z.string().min(1, "Password is required") });
type Form = z.infer<typeof schema>;

const DEMO: { role: Role; email: string; password: string }[] = [
  { role: "ADMIN", email: "admin@local.dev", password: "Admin@1234" },
  { role: "WARD_OFFICER", email: "operator@local.dev", password: "Operator@1234" },
  { role: "PET_OWNER", email: "user@local.dev", password: "User@1234" },
  { role: "VET_CLINIC", email: "vet@local.dev", password: "Vet@1234" },
  { role: "RESCUE_ORG", email: "rescue@local.dev", password: "Rescue@1234" },
];

export function LoginForm({ next, showDemo }: { next: string; showDemo: boolean }) {
  const { register, handleSubmit, formState, setValue } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const [busy, setBusy] = useState<string | null>(null);

  const login = async (v: Form) => {
    setBusy(v.email);
    try {
      const r = await api<{ user: { fullName: string } }>("/auth/login", { method: "POST", body: v });
      toast.success(`Welcome back, ${r.user.fullName}`);
      window.location.href = next;
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  };

  return (
    <Card className="rounded-2xl p-6 shadow-pop sm:p-10">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">Sign in</h1>
      <p className="mt-1 text-sm text-muted">
        New here?{" "}
        <a href="/register" className="font-medium text-accent hover:underline">
          Create an account
        </a>{" "}
        — pet owners, clinics and rescue organisations can sign up themselves.
      </p>
      <form onSubmit={handleSubmit(login)} className="mt-6 space-y-4" noValidate>
        <Field label="Email" error={formState.errors.email?.message} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!formState.errors.email} />
        </Field>
        <Field label="Password" error={formState.errors.password?.message} htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" {...register("password")} aria-invalid={!!formState.errors.password} />
        </Field>
        <Button type="submit" variant="success" className="h-12 w-full" loading={busy !== null && !DEMO.some((d) => d.email === busy)}>
          <LogIn /> Sign in
        </Button>
      </form>
      {showDemo && (
        <div className="mt-8 border-t border-border pt-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Local demo accounts</p>
          <div className="mt-3 grid gap-2">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => {
                  setValue("email", d.email);
                  setValue("password", d.password);
                  void login({ email: d.email, password: d.password });
                }}
                disabled={busy !== null}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-sm transition hover:border-border-strong disabled:opacity-60"
              >
                <span>
                  <span className="block font-medium text-fg">{ROLE_LABEL[d.role]}</span>
                  <span className="block text-xs text-muted">{d.email}</span>
                </span>
                {busy === d.email ? <span className="size-4 animate-spin rounded-full border-2 border-border-strong border-t-fg" /> : <span className="font-mono text-[11px] text-muted">{d.password}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
