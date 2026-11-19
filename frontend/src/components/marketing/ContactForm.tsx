"use client";

import { CheckCircle2, MessageSquareText, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";

const TOPICS = ["GENERAL", "REPORT_HELP", "PARTNERSHIP", "DATA_REQUEST", "TECHNICAL"] as const;
const MOBILE = /^9[78]\d{8}$/;
const normalise = (v: string) => v.replace(/[\s-]/g, "").replace(/^\+?977/, "");

/** Contact form: the mobile number is verified with an SMS one-time code before the message is accepted. */
export function ContactForm() {
  const { t } = useI18n();
  const [f, setF] = useState({ name: "", phone: "", email: "", topic: "GENERAL", message: "", otp: "" });
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof f, string>>>({});

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const phoneOk = MOBILE.test(normalise(f.phone));

  const sendCode = async () => {
    if (!phoneOk) return setErrors((e) => ({ ...e, phone: "98XXXXXXXX" }));
    setSending(true);
    try {
      const r = await api<{ to: string }>("/public/otp", { method: "POST", body: { phone: normalise(f.phone) } });
      setSentTo(r.to);
      setCooldown(60);
      setErrors((e) => ({ ...e, phone: undefined }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (f.name.trim().length < 2) next.name = "≥ 2";
    if (!phoneOk) next.phone = "98XXXXXXXX";
    if (f.message.trim().length < 10) next.message = "≥ 10";
    if (!/^\d{6}$/.test(f.otp)) next.otp = "######";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      const r = await api<{ reference: string }>("/public/inquiries", { method: "POST", body: { ...f, phone: normalise(f.phone), email: f.email || null } });
      setDone(r.reference);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-success/30 bg-success/5 p-8 text-center">
        <CheckCircle2 className="size-10 text-success" />
        <h3 className="mt-4 text-lg font-semibold text-fg">{t("contact.success.title")}</h3>
        <p className="mt-1 text-sm text-muted">{t("contact.success.body", { ref: done })}</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => {
            setDone(null);
            setSentTo(null);
            setF({ name: "", phone: "", email: "", topic: "GENERAL", message: "", otp: "" });
          }}
        >
          {t("contact.another")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label={t("contact.name")} required error={errors.name}>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" maxLength={100} />
      </Field>
      <Field label={t("contact.email")}>
        <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
      </Field>
      <Field label={t("contact.phone")} required error={errors.phone} className="sm:col-span-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">+977</span>
            <Input
              type="tel"
              inputMode="numeric"
              value={f.phone}
              onChange={(e) => {
                setF({ ...f, phone: e.target.value, otp: "" });
                setSentTo(null);
              }}
              placeholder="98XXXXXXXX"
              className="pl-14"
              autoComplete="tel-national"
              aria-invalid={!!errors.phone}
            />
          </div>
          <Button type="button" variant="secondary" onClick={() => void sendCode()} loading={sending} disabled={!phoneOk || cooldown > 0}>
            <MessageSquareText /> {sentTo ? (cooldown > 0 ? `${t("contact.resend")} ${cooldown}s` : t("contact.resend")) : t("contact.sendCode")}
          </Button>
        </div>
      </Field>
      {sentTo && (
        <Field label={t("contact.code")} required error={errors.otp} hint={t("contact.codeSent", { to: sentTo })} className="sm:col-span-2">
          <Input
            value={f.otp}
            onChange={(e) => setF({ ...f, otp: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="______"
            className="max-w-40 text-center font-mono text-lg tracking-[0.5em]"
            aria-invalid={!!errors.otp}
          />
        </Field>
      )}
      <Field label={t("contact.topic")} className="sm:col-span-2">
        <Select value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>
          {TOPICS.map((k) => (
            <option key={k} value={k}>
              {t(`contact.topic.${k}` as MessageKey)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("contact.message")} required error={errors.message} className="sm:col-span-2">
        <Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} className="min-h-32" maxLength={2000} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" variant="primary" loading={submitting} disabled={!sentTo}>
          <Send /> {t("contact.submit")}
        </Button>
      </div>
    </form>
  );
}
