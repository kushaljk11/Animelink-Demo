"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Building2, Check, HeartHandshake, PawPrint, Stethoscope, UserPlus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { MunicipalityInput } from "@/components/forms/MunicipalityInput";
import { LocationPicker } from "@/components/maps/LocationPicker";
import { Button } from "@/components/ui/button";
import { Card, Field, Input, Select } from "@/components/ui/primitives";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import type { LatLng } from "@/lib/geo";
import { cn } from "@/lib/utils";

type AccountType = "PET_OWNER" | "VET_CLINIC" | "RESCUE_ORG";

const TYPES: { value: AccountType; title: string; body: string; can: string[]; icon: LucideIcon }[] = [
  {
    value: "PET_OWNER",
    title: "Pet owner",
    body: "Keep your pet's vaccination record, QR tag and reminders in one place.",
    can: ["Register pets & get a QR tag", "Booster reminders & certificates", "Lost-pet alerts"],
    icon: PawPrint,
  },
  {
    value: "VET_CLINIC",
    title: "Veterinary clinic",
    body: "Record and verify vaccinations for pets you treat.",
    can: ["Record & verify vaccinations", "Verify owners' paper cards", "Message pet owners"],
    icon: Stethoscope,
  },
  {
    value: "RESCUE_ORG",
    title: "Rescue organisation",
    body: "Track community dogs and CNVR work in your area.",
    can: ["Register strays with duplicate check", "Record CNVR activity", "Stray & incident maps"],
    icon: HeartHandshake,
  },
];

const PHONE = /^(\+?977[-\s]?)?(9[678]\d{8}|0\d{1,2}-?\d{6,7})$/;
const ward = z.string().optional().refine((v) => !v || (Number(v) >= 1 && Number(v) <= 35), "Ward must be 1–35");

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(100),
    email: z.string().trim().email("Enter a valid email"),
    phone: z.string().trim().optional().refine((v) => !v || PHONE.test(v), "Enter a valid Nepali mobile or landline number"),
    password: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[a-z]/, "Add a lowercase letter")
      .regex(/[A-Z]/, "Add an uppercase letter")
      .regex(/\d/, "Add a number"),
    confirm: z.string(),
    municipality: z.string().optional(),
    wardNumber: ward,
    // organisation (vet / rescue)
    orgName: z.string().trim().optional(),
    registrationNumber: z.string().trim().optional(),
    orgPhone: z.string().trim().optional(),
    address: z.string().trim().optional(),
    openingHours: z.string().trim().optional(),
    hasShelter: z.boolean().optional(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] });
type Form = z.infer<typeof schema>;

const ACCOUNT_FIELDS: FieldPath<Form>[] = ["fullName", "email", "phone", "password", "confirm", "municipality", "wardNumber"];

export function RegisterForm() {
  const [type, setType] = useState<AccountType | null>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [orgErrors, setOrgErrors] = useState<Record<string, string>>({});
  const { register, handleSubmit, trigger, getValues, setValue, formState, setError } = useForm<Form>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { municipality: "", hasShelter: true },
  });
  const e = formState.errors;
  const isOrg = type === "VET_CLINIC" || type === "RESCUE_ORG";
  const steps = isOrg ? ["Account type", "Your details", type === "VET_CLINIC" ? "Clinic" : "Organisation"] : ["Account type", "Your details"];

  const validateOrg = () => {
    const v = getValues();
    const errs: Record<string, string> = {};
    if (!v.orgName || v.orgName.length < 3) errs.orgName = `Enter the ${type === "VET_CLINIC" ? "clinic" : "organisation"} name`;
    if (type === "VET_CLINIC" && (!v.registrationNumber || v.registrationNumber.length < 3)) errs.registrationNumber = "Enter the Nepal Veterinary Council registration number";
    if (!v.orgPhone || !PHONE.test(v.orgPhone)) errs.orgPhone = "Enter a valid contact number";
    if (!v.address || v.address.length < 3) errs.address = "Enter the address";
    if (!loc) errs.location = "Pin the location on the map so people can find you";
    setOrgErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = handleSubmit(async (v) => {
    if (isOrg && !validateOrg()) return;
    const ward = v.wardNumber ? Number(v.wardNumber) : undefined;
    const profile = {
      phone: v.orgPhone,
      address: v.address,
      latitude: loc?.lat,
      longitude: loc?.lng,
      municipality: v.municipality || undefined,
      wardNumber: ward,
    };
    try {
      await api("/auth/register", {
        method: "POST",
        body: {
          fullName: v.fullName,
          email: v.email,
          phone: v.phone || undefined,
          password: v.password,
          role: type,
          municipality: v.municipality || undefined,
          wardNumber: ward,
          ...(type === "VET_CLINIC" ? { clinic: { ...profile, clinicName: v.orgName, registrationNumber: v.registrationNumber, openingHours: v.openingHours || null } } : {}),
          ...(type === "RESCUE_ORG" ? { organization: { ...profile, organizationName: v.orgName, hasShelter: v.hasShelter ?? true } } : {}),
        },
      });
      toast.success(isOrg ? "Account created — an administrator will verify your profile shortly." : "Welcome! Let's register your first pet.");
      window.location.href = type === "PET_OWNER" ? "/app/pets?new=1" : "/app/settings";
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409 && /email/i.test(err.message)) {
        setStep(1);
        setError("email", { message: "An account with this email already exists — sign in instead" });
      } else toast.error(errorMessage(err));
    }
  });

  const next = async () => {
    if (step === 0 && type) return setStep(1);
    if (step === 1 && (await trigger(ACCOUNT_FIELDS, { shouldFocus: true }))) {
      if (isOrg) setStep(2);
      else void submit();
    }
  };

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Create an account</h1>
          <p className="mt-1 text-sm text-muted">
            Already registered? <Link href="/login" className="font-medium text-accent hover:underline">Sign in</Link>
          </p>
        </div>
        <UserPlus className="size-6 text-muted" />
      </div>

      <ol className="mt-6 flex gap-2">
        {steps.map((label, i) => (
          <li key={label} className="flex-1">
            <span className={cn("block h-1 rounded-full", i <= step ? "bg-fg" : "bg-surface-3")} />
            <span className={cn("mt-1.5 block text-[11px] font-medium", i === step ? "text-fg" : "text-muted")}>{label}</span>
          </li>
        ))}
      </ol>

      <form onSubmit={(ev) => { ev.preventDefault(); if (step === 2) void submit(); else void next(); }} className="mt-6 space-y-4" noValidate>
        {step === 0 && (
          <div className="grid gap-3">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                aria-pressed={type === t.value}
                className={cn("flex gap-4 rounded-xl border p-4 text-left transition", type === t.value ? "border-fg bg-surface-3" : "border-border hover:border-border-strong")}
              >
                <t.icon className="mt-0.5 size-5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium text-fg">
                    {t.title}
                    {type === t.value && <Check className="size-4 text-success" />}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">{t.body}</span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {t.can.map((c) => (
                      <span key={c} className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] text-fg-soft">{c}</span>
                    ))}
                  </span>
                </span>
              </button>
            ))}
            <p className="text-xs text-muted">Reporting a dog bite? You don&apos;t need an account — <Link href="/submit" className="text-accent hover:underline">report it here</Link>. Ward officer accounts are created by an administrator.</p>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={e.fullName?.message} className="sm:col-span-2">
              <Input autoComplete="name" {...register("fullName")} aria-invalid={!!e.fullName} />
            </Field>
            <Field label="Email" required error={e.email?.message}>
              <Input type="email" autoComplete="email" {...register("email")} aria-invalid={!!e.email} />
            </Field>
            <Field label="Mobile number" error={e.phone?.message} hint="Shown to finders only while your pet is marked lost">
              <Input type="tel" autoComplete="tel" placeholder="98XXXXXXXX" {...register("phone")} aria-invalid={!!e.phone} />
            </Field>
            <Field label="Password" required error={e.password?.message} hint="8+ characters with upper, lower case and a number">
              <Input type="password" autoComplete="new-password" {...register("password")} aria-invalid={!!e.password} />
            </Field>
            <Field label="Confirm password" required error={e.confirm?.message}>
              <Input type="password" autoComplete="new-password" {...register("confirm")} aria-invalid={!!e.confirm} />
            </Field>
            <Field label="Municipality">
              <MunicipalityInput {...register("municipality")} onDetected={(p) => p.wardNumber && setValue("wardNumber", String(p.wardNumber) as never)} />
            </Field>
            <Field label="Ward" error={e.wardNumber?.message}>
              <Input type="number" min={1} max={35} {...register("wardNumber")} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid content-start gap-4">
              <p className="rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted">
                An administrator checks new {type === "VET_CLINIC" ? "clinics" : "organisations"} before they can {type === "VET_CLINIC" ? "verify vaccinations" : "record CNVR activity"}. You can sign in and explore straight away.
              </p>
              <Field label={type === "VET_CLINIC" ? "Clinic name" : "Organisation name"} required error={orgErrors.orgName}>
                <Input {...register("orgName")} />
              </Field>
              {type === "VET_CLINIC" && (
                <Field label="Registration number" required error={orgErrors.registrationNumber}>
                  <Input placeholder="NVC-2020-1234" {...register("registrationNumber")} />
                </Field>
              )}
              <Field label="Contact number" required error={orgErrors.orgPhone}>
                <Input type="tel" placeholder="01-4XXXXXX or 98XXXXXXXX" {...register("orgPhone")} />
              </Field>
              <Field label="Address" required error={orgErrors.address}>
                <Input placeholder="Street, tole, municipality" {...register("address")} />
              </Field>
              {type === "VET_CLINIC" ? (
                <Field label="Opening hours">
                  <Input placeholder="Sun–Fri 9:00–18:00" {...register("openingHours")} />
                </Field>
              ) : (
                <label className="flex items-center gap-2 text-sm text-fg-soft">
                  <input type="checkbox" {...register("hasShelter")} /> We run a shelter facility
                </label>
              )}
            </div>
            <Field label="Location on the map" required error={orgErrors.location} hint="Used for the public “nearby vets & shelters” search">
              <LocationPicker
                value={loc}
                onChange={(p) => setLoc(p)}
                invalid={!!orgErrors.location}
                onPlace={(place) => {
                  if (place.address && !getValues("address")) setValue("address", place.address);
                  if (place.municipality && !getValues("municipality")) setValue("municipality", place.municipality);
                  if (place.wardNumber && !getValues("wardNumber")) setValue("wardNumber", String(place.wardNumber) as never);
                }}
              />
            </Field>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={() => setStep((s) => (s === 0 ? 0 : ((s - 1) as 0 | 1)))} disabled={step === 0}>
            <ArrowLeft /> Back
          </Button>
          {step === 0 ? (
            <Button type="submit" variant="primary" disabled={!type}>Continue <ArrowRight /></Button>
          ) : step === 1 && isOrg ? (
            <Button type="submit" variant="primary">Continue <ArrowRight /></Button>
          ) : (
            <Button type="submit" variant="primary" loading={formState.isSubmitting}>
              {isOrg ? <Building2 /> : <UserPlus />} Create account
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
