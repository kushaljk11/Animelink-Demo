"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ArrowLeft, ArrowRight, Bird, Cat, Check, ClipboardList, Dog, ImagePlus, Loader2, MapPin, PawPrint, Rabbit, ShieldAlert, Trash2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CopyButton } from "@/components/entities/common";
import { MunicipalityInput } from "@/components/forms/MunicipalityInput";
import { LocationPicker } from "@/components/maps/LocationPicker";
import { Button } from "@/components/ui/button";
import { DualDate } from "@/components/ui/dual-date";
import { Card, DetailRow, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { api, errorMessage, uploadImage } from "@/lib/api";
import { ANIMAL_TYPES, SEVERITIES } from "@/lib/constants";
import { cn, formatDateTime, titleCase } from "@/lib/utils";

// Client-side mirror of incidentCreateSchema (the server re-validates everything).
const NEPAL = { minLat: 26.3, maxLat: 30.5, minLng: 80.0, maxLng: 88.3 };
/** 10-digit Nepali mobile (98/97…), +977 / spaces / dashes tolerated: the tracking code is sent to it by SMS. */
const PHONE = /^9[78]\d{8}$/;
const normPhone = (v: string) => v.replace(/[\s-]/g, "").replace(/^\+?977/, "");

const schema = z
  .object({
    animalType: z.enum(ANIMAL_TYPES),
    severity: z.enum(SEVERITIES, { errorMap: () => ({ message: "Choose how serious the injury is" }) }),
    suspectedRabies: z.boolean(),
    incidentDate: z
      .string()
      .min(1, "When did it happen?")
      .refine((v) => new Date(v).getTime() <= Date.now() + 60_000, "Date cannot be in the future")
      .refine((v) => new Date(v).getTime() > Date.now() - 365 * 86_400_000, "Must be within the last year"),
    description: z.string().trim().min(10, "Describe what happened (at least 10 characters)").max(2000),
    location: z
      .object({ lat: z.number(), lng: z.number() }, { required_error: "Pin the location on the map or use your GPS", invalid_type_error: "Pin the location on the map or use your GPS" })
      .refine((p) => p.lat >= NEPAL.minLat && p.lat <= NEPAL.maxLat && p.lng >= NEPAL.minLng && p.lng <= NEPAL.maxLng, "The location must be inside Nepal"),
    locationAccuracyM: z.number().optional(),
    address: z.string().trim().max(200).optional(),
    municipality: z.string().optional(),
    wardNumber: z.string().optional().refine((v) => !v || (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 35), "Ward must be 1–35"),
    reporterName: z.string().trim().max(100).optional(),
    reporterPhone: z.string().trim().optional(),
    consent: z.literal(true, { errorMap: () => ({ message: "Please confirm before submitting" }) }),
    signedIn: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.signedIn) {
      if (!v.reporterPhone) ctx.addIssue({ code: "custom", path: ["reporterPhone"], message: "A phone number is needed so the ward office can follow up" });
      else if (!PHONE.test(normPhone(v.reporterPhone))) ctx.addIssue({ code: "custom", path: ["reporterPhone"], message: "Enter a 10-digit mobile number (98XXXXXXXX). Your tracking code is sent to it by SMS" });
    } else if (v.reporterPhone && !PHONE.test(normPhone(v.reporterPhone))) {
      ctx.addIssue({ code: "custom", path: ["reporterPhone"], message: "Enter a 10-digit mobile number (98XXXXXXXX). Your tracking code is sent to it by SMS" });
    }
  });
type FormValues = z.infer<typeof schema>;

const STEPS: { title: string; description: string; fields: FieldPath<FormValues>[] }[] = [
  { title: "What happened", description: "Animal, severity and a short description", fields: ["animalType", "severity", "suspectedRabies", "incidentDate", "description"] },
  { title: "Where", description: "Pin the exact place on the map", fields: ["location", "address", "municipality", "wardNumber"] },
  { title: "Photo & contact", description: "Optional evidence and how to reach you", fields: ["reporterName", "reporterPhone"] },
  { title: "Review", description: "Check and submit", fields: ["consent"] },
];

const ANIMAL_ICON: Record<string, LucideIcon> = { DOG: Dog, CAT: Cat, MONKEY: PawPrint, JACKAL: Dog, MONGOOSE: Rabbit, LIVESTOCK: PawPrint, OTHER: Bird };
const SEVERITY_HELP: Record<string, string> = {
  LOW: "Lick on intact skin, or touched / fed the animal — no break in the skin",
  MODERATE: "Nibble on uncovered skin, or minor scratch without bleeding",
  HIGH: "Bite or scratch that broke the skin, bleeding, or saliva on a wound / eyes / mouth",
};
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

type Created = { id: string; trackingCode: string; status: string; createdAt: string; trackingPath: string | null; guidance: string | null };

export function SubmitWizard({ signedIn, userName }: { signedIn: boolean; userName?: string }) {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<{ url: string | null; preview: string; name: string; uploading: boolean } | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      animalType: "DOG",
      suspectedRabies: false,
      incidentDate: nowLocal(),
      description: "",
      address: "",
      municipality: "",
      wardNumber: "",
      reporterName: "",
      reporterPhone: "",
      signedIn,
    } as Partial<FormValues>,
  });
  const { register, control, handleSubmit, trigger, watch, formState, setValue, getValues } = form;
  const values = watch();

  useEffect(() => () => {
    if (photo?.preview) URL.revokeObjectURL(photo.preview);
  }, [photo?.preview]);

  const next = async () => {
    const ok = await trigger(STEPS[step]!.fields, { shouldFocus: true });
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
    else toast.error("Please fix the highlighted fields");
  };

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return toast.error("Use a JPEG, PNG or WebP image");
    if (file.size > 5 * 1024 * 1024) return toast.error("Photo must be 5 MB or smaller");
    const preview = URL.createObjectURL(file);
    setPhoto({ url: null, preview, name: file.name, uploading: true });
    try {
      const up = await uploadImage(file, "incidents");
      setPhoto({ url: up.url, preview, name: file.name, uploading: false });
      toast.success("Photo attached (location metadata removed)");
    } catch (err) {
      setPhoto(null);
      toast.error(errorMessage(err));
    }
  };

  const submit = handleSubmit(async (v) => {
    if (photo?.uploading) return toast.error("Wait for the photo to finish uploading");
    try {
      const r = await api<Created>("/incidents", {
        method: "POST",
        body: {
          animalType: v.animalType,
          severity: v.severity,
          suspectedRabies: v.suspectedRabies,
          incidentDate: new Date(v.incidentDate).toISOString(),
          description: v.description,
          latitude: v.location.lat,
          longitude: v.location.lng,
          locationAccuracyM: v.locationAccuracyM ?? null,
          address: v.address || null,
          municipality: v.municipality || null,
          wardNumber: v.wardNumber ? Number(v.wardNumber) : null,
          photoUrl: photo?.url ?? null,
          reporterName: signedIn ? null : v.reporterName || null,
          reporterPhone: signedIn ? null : v.reporterPhone ? normPhone(v.reporterPhone) : null,
        },
      });
      setCreated(r);
      toast.success("Report submitted — save your tracking code");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, () => toast.error("Some details are missing — check the earlier steps"));

  if (created) {
    return (
      <Card className="mx-auto max-w-2xl space-y-6 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-success/15 text-success"><Check className="size-6" /></span>
          <div>
            <h2 className="text-lg font-semibold text-fg">Report received</h2>
            <p className="text-sm text-muted">The ward office has been notified{values.suspectedRabies || values.severity === "HIGH" ? " and your report is flagged as high priority" : ""}.</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Your tracking code</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="break-all font-mono text-2xl font-semibold tracking-wider text-fg">{created.trackingCode}</code>
            <CopyButton value={created.trackingCode} label="Copy code" />
          </div>
          <p className="mt-2 text-xs text-muted">
            {signedIn ? "Keep this code to check progress." : "We also sent it to your phone by SMS. You can track with the code or your mobile number."} Submitted <DualDate value={created.createdAt} time />.
          </p>
        </div>
        {created.guidance && (
          <div className="flex gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-fg">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" />
            <p>{created.guidance} Rabies is preventable with prompt treatment — do not wait for symptoms.</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="primary"><Link href={`/track?q=${created.trackingCode}`}><ClipboardList /> Track this report</Link></Button>
          {created.trackingPath && <Button asChild variant="secondary"><Link href={created.trackingPath}>Open in dashboard</Link></Button>}
          <Button asChild variant="ghost"><Link href="/nearby">Find a nearby clinic</Link></Button>
        </div>
      </Card>
    );
  }

  const e = formState.errors;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* stepper */}
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step} className="w-full text-left">
              <span className={cn("block h-1 rounded-full transition", i <= step ? "bg-fg" : "bg-surface-3")} />
              <span className={cn("mt-2 block text-[11px] font-semibold uppercase tracking-wider", i === step ? "text-fg" : "text-muted")}>Step {i + 1}</span>
              <span className={cn("hidden text-sm sm:block", i === step ? "text-fg" : "text-muted")}>{s.title}</span>
            </button>
          </li>
        ))}
      </ol>

      <Card className="p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-fg">{STEPS[step]!.title}</h2>
          <p className="text-sm text-muted">{STEPS[step]!.description}</p>
        </div>

        <form onSubmit={(ev) => { ev.preventDefault(); if (step === STEPS.length - 1) void submit(); else void next(); }} noValidate>
          {step === 0 && (
            <div className="space-y-5">
              <Field label="Animal involved" required>
                <Controller
                  control={control}
                  name="animalType"
                  render={({ field }) => (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                      {ANIMAL_TYPES.map((a) => {
                        const Icon = ANIMAL_ICON[a] ?? PawPrint;
                        return (
                          <button key={a} type="button" onClick={() => field.onChange(a)} aria-pressed={field.value === a} className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition", field.value === a ? "border-fg bg-surface-3 text-fg" : "border-border text-muted hover:border-border-strong")}>
                            <Icon className="size-5" /> {titleCase(a)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
              </Field>
              <Field label="How serious is the exposure?" required error={e.severity?.message}>
                <Controller
                  control={control}
                  name="severity"
                  render={({ field }) => (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {SEVERITIES.map((s) => (
                        <button key={s} type="button" onClick={() => field.onChange(s)} aria-pressed={field.value === s} className={cn("rounded-xl border p-3 text-left transition", field.value === s ? (s === "HIGH" ? "border-danger bg-danger/10" : s === "MODERATE" ? "border-warning bg-warning/10" : "border-fg bg-surface-3") : "border-border hover:border-border-strong")}>
                          <span className="block text-sm font-semibold text-fg">{titleCase(s)}</span>
                          <span className="mt-1 block text-xs leading-snug text-muted">{SEVERITY_HELP[s]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                />
              </Field>
              <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 transition", values.suspectedRabies ? "border-danger/40 bg-danger/5" : "border-border")}>
                <input type="checkbox" className="mt-1" {...register("suspectedRabies")} />
                <span>
                  <span className="block text-sm font-medium text-fg">The animal may have rabies</span>
                  <span className="block text-xs text-muted">Unusual aggression, drooling or foaming, staggering, paralysis, biting without provocation, or the animal died soon after. This is your observation, not a diagnosis.</span>
                </span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="When did it happen?" required error={e.incidentDate?.message}>
                  <Input type="datetime-local" max={nowLocal()} {...register("incidentDate")} aria-invalid={!!e.incidentDate} />
                </Field>
              </div>
              <Field label="What happened?" required error={e.description?.message} hint={`${values.description?.length ?? 0}/2000`}>
                <Textarea {...register("description")} placeholder="e.g. A brown street dog bit my son on the leg near the bus stop. It ran towards the temple." aria-invalid={!!e.description} className="min-h-28" />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <Controller
                control={control}
                name="location"
                render={({ field }) => (
                  <Field label="Location" required error={e.location?.message ?? (e.location as { root?: { message?: string } } | undefined)?.root?.message}>
                    <LocationPicker
                      value={field.value ?? null}
                      invalid={!!e.location}
                      onChange={(p, acc) => {
                        field.onChange(p);
                        setValue("locationAccuracyM", acc);
                        void trigger("location");
                      }}
                      onPlace={(place) => {
                        // The pin decides the area (and so which ward office receives the report).
                        if (place.municipality) setValue("municipality", place.municipality, { shouldDirty: true });
                        if (place.wardNumber) setValue("wardNumber", String(place.wardNumber) as never, { shouldDirty: true });
                        if (place.address && !getValues("address")) setValue("address", place.address, { shouldDirty: true });
                      }}
                    />
                  </Field>
                )}
              />
              {values.locationAccuracyM !== undefined && values.locationAccuracyM > 100 && (
                <p className="flex items-center gap-2 text-xs text-warning"><AlertTriangle className="size-3.5" /> GPS accuracy is ±{Math.round(values.locationAccuracyM)} m — drag the pin to the exact spot if you can.</p>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Nearest landmark" className="sm:col-span-3"><Input {...register("address")} placeholder="e.g. Kalanki Chowk, near the bus stop" /></Field>
                <Field label="Municipality" className="sm:col-span-2">
                  <MunicipalityInput {...register("municipality")} placeholder="Filled in from the pin, or type it" />
                </Field>
                <Field label="Ward" error={e.wardNumber?.message}><Input type="number" min={1} max={35} {...register("wardNumber")} placeholder="e.g. 14" /></Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <Field label="Photo (optional)" hint="Only if it is safe — never approach the animal. GPS metadata is stripped and the photo is visible only to ward officers and rescue teams.">
                {photo ? (
                  <div className="flex items-center gap-3 rounded-xl border border-border p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.preview} alt="Selected evidence" className="size-20 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate text-fg">{photo.name}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted">{photo.uploading ? <><Loader2 className="size-3 animate-spin" /> Uploading…</> : <><Check className="size-3 text-success" /> Attached</>}</p>
                    </div>
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => setPhoto(null)} aria-label="Remove photo"><Trash2 /></Button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-2 p-6 text-sm text-muted transition hover:border-fg-soft hover:text-fg">
                    <ImagePlus className="size-6" /> Add a photo of the animal or the place
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(ev) => void choosePhoto(ev.target.files?.[0])} />
              </Field>
              {signedIn ? (
                <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-fg-soft">You&apos;re signed in as <strong>{userName}</strong> — the ward office will contact you through your account.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Your name"><Input {...register("reporterName")} autoComplete="name" /></Field>
                  <Field label="Phone number" required error={e.reporterPhone?.message} hint="We SMS your tracking code here. Only the team handling your report sees it.">
                    <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="98XXXXXXXX" {...register("reporterPhone")} aria-invalid={!!e.reporterPhone} />
                  </Field>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <dl className="divide-y divide-border rounded-xl border border-border px-4">
                <DetailRow label="Animal">{titleCase(values.animalType)}</DetailRow>
                <DetailRow label="Severity">{values.severity ? titleCase(values.severity) : "—"}</DetailRow>
                <DetailRow label="Rabies suspected">{values.suspectedRabies ? "Yes" : "No"}</DetailRow>
                <DetailRow label="When">{values.incidentDate ? formatDateTime(values.incidentDate) : "—"}</DetailRow>
                <DetailRow label="Description">{values.description}</DetailRow>
                <DetailRow label="Location">
                  {values.location ? (
                    <span className="flex items-center gap-1.5"><MapPin className="size-3.5 text-muted" />{[values.address, values.wardNumber ? `Ward ${values.wardNumber}` : null, values.municipality].filter(Boolean).join(", ") || `${values.location.lat.toFixed(5)}, ${values.location.lng.toFixed(5)}`}</span>
                  ) : (
                    <span className="text-danger">Missing — go back to step 2</span>
                  )}
                </DetailRow>
                <DetailRow label="Photo">{photo ? "Attached" : "None"}</DetailRow>
                <DetailRow label="Contact">{signedIn ? userName : [getValues("reporterName"), getValues("reporterPhone")].filter(Boolean).join(" · ") || "—"}</DetailRow>
              </dl>
              <label className="flex gap-3 text-sm text-fg-soft">
                <input type="checkbox" className="mt-1" {...register("consent")} />
                <span>The information is accurate to the best of my knowledge. I understand this report records an incident and is <strong>not a medical diagnosis</strong>, and that I should seek medical care for any bite or scratch.</span>
              </label>
              {e.consent && <p className="text-xs text-danger">{e.consent.message}</p>}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}><ArrowLeft /> Back</Button>
            {step < STEPS.length - 1 ? (
              <Button type="submit" variant="primary">Continue <ArrowRight /></Button>
            ) : (
              <Button type="submit" variant="danger" loading={formState.isSubmitting} disabled={photo?.uploading}><ShieldAlert /> Submit report</Button>
            )}
          </div>
        </form>
      </Card>

      <p className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-fg">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" />
        <span>If someone was bitten or scratched: wash the wound with soap and running water for 15 minutes and go to a hospital or health facility <strong>today</strong> for anti-rabies treatment. Ambulance: 102.</span>
      </p>
    </div>
  );
}
