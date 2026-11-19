"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ImagePlus, ScanSearch, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import useSWR from "swr";
import { z } from "zod";
import type { Facet, InspectorProps } from "@/components/tables/DataTable";
import { MunicipalityInput } from "@/components/forms/MunicipalityInput";
import { LocationPicker } from "@/components/maps/LocationPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { DetailRow, Field, Input, Select, Skeleton, Textarea } from "@/components/ui/primitives";
import { StatusPill } from "@/components/ui/status-pill";
import { api, ApiClientError, errorMessage, uploadImage } from "@/lib/api";
import { can, useSession } from "@/lib/client/session";
import { GENDERS, options } from "@/lib/constants";
import type { LatLng } from "@/lib/geo";
import { cn, formatDate, titleCase } from "@/lib/utils";
import { DateCell, MapLink, Section, TitleCell, Timeline, YesNo } from "./common";

export type StrayRow = {
  id: string;
  tagOrEarMark: string | null;
  species: string;
  gender: string;
  estimatedAge: string | null;
  color: string | null;
  breed: string | null;
  physicalDescription: string | null;
  photoUrl: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  wardNumber: number | null;
  municipality: string | null;
  createdAt: string;
  registeredBy: { id: string; fullName: string; rescueOrganization: { organizationName: string } | null };
  cnvr: { count: number; sterilized: boolean; vaccinated: boolean; lastVaccinationDate: string | null; lastActivityAt: string | null };
};

type StrayDetail = Omit<StrayRow, "cnvr"> & {
  cnvrRecords: { id: string; vaccineName: string | null; vaccinationDate: string | null; sterilizationDate: string | null; releaseDate: string | null; notes: string | null; createdAt: string; organization: { id: string; organizationName: string } }[];
};

export type CnvrRow = {
  id: string;
  vaccineName: string | null;
  vaccinationDate: string | null;
  sterilizationDate: string | null;
  releaseDate: string | null;
  releaseLatitude: number | null;
  releaseLongitude: number | null;
  notes: string | null;
  createdAt: string;
  organizationId: string;
  stray: { id: string; tagOrEarMark: string | null; color: string | null; gender: string; photoUrl: string | null; municipality: string | null; wardNumber: number | null };
  organization: { id: string; organizationName: string };
};

const short = (m: string | null) => m?.replace(" Metropolitan City", "").replace(" Municipality", "") ?? "";

export const strayColumns: ColumnDef<StrayRow, unknown>[] = [
  {
    accessorKey: "tagOrEarMark",
    header: "Animal",
    enableSorting: true,
    enableHiding: false,
    cell: ({ row }) => <TitleCell title={row.original.tagOrEarMark ?? "Unmarked"} subtitle={[titleCase(row.original.gender), row.original.color, row.original.estimatedAge].filter(Boolean).join(" · ")} image={row.original.photoUrl} />,
    meta: { label: "Tag / ear mark" },
  },
  {
    id: "location",
    header: "Location",
    cell: ({ row }) => (
      <div className="min-w-40">
        <p className="truncate text-fg-soft">{row.original.address ?? "—"}</p>
        <p className="text-xs text-muted">{row.original.wardNumber ? `Ward ${row.original.wardNumber}, ` : ""}{short(row.original.municipality)}</p>
      </div>
    ),
    meta: { label: "Location", exportValue: (r) => [r.address, r.wardNumber ? `Ward ${r.wardNumber}` : null, r.municipality].filter(Boolean).join(", ") },
  },
  { id: "sterilized", header: "Sterilised", cell: ({ row }) => <YesNo value={row.original.cnvr.sterilized} />, meta: { label: "Sterilised", exportValue: (r) => (r.cnvr.sterilized ? "Yes" : "No") } },
  { id: "vaccinated", header: "Vaccinated", cell: ({ row }) => <YesNo value={row.original.cnvr.vaccinated} />, meta: { label: "Vaccinated", exportValue: (r) => (r.cnvr.vaccinated ? "Yes" : "No") } },
  { id: "cnvrCount", header: "CNVR", cell: ({ row }) => <span className="tabular-nums text-fg-soft">{row.original.cnvr.count}</span>, meta: { label: "CNVR records", exportValue: (r) => r.cnvr.count } },
  { id: "registeredBy", header: "Registered by", cell: ({ row }) => <span className="text-fg-soft">{row.original.registeredBy.rescueOrganization?.organizationName ?? row.original.registeredBy.fullName}</span>, meta: { label: "Registered by", exportValue: (r) => r.registeredBy.rescueOrganization?.organizationName ?? r.registeredBy.fullName } },
  { accessorKey: "createdAt", header: "Registered", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.createdAt} />, meta: { label: "Registered" } },
];

export const strayFacets = (municipalities: { value: string; label: string }[]): Facet[] => [
  { key: "sterilized", label: "Sterilised", single: true, options: [{ value: "true", label: "Sterilised" }, { value: "false", label: "Not sterilised" }] },
  { key: "vaccinated", label: "Vaccinated", single: true, options: [{ value: "true", label: "Vaccinated" }, { value: "false", label: "Not vaccinated" }] },
  { key: "gender", label: "Gender", options: options(GENDERS) },
  ...(municipalities.length ? [{ key: "municipality", label: "Municipality", single: true, options: municipalities }] : []),
];

// ------------------------------------------------------------ inspector

const today = () => new Date().toISOString().slice(0, 10);

export function StrayInspector({ row, refresh }: InspectorProps<StrayRow>) {
  const session = useSession();
  const { data, mutate } = useSWR<StrayDetail>(`/strays/${row.id}`);
  const [form, setForm] = useState({ vaccineName: "Rabisin (Rabies)", vaccinationDate: today(), sterilizationDate: "", releaseDate: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const canRecord = session.role === "RESCUE_ORG" && session.organizationStatus === "VERIFIED";

  const record = async () => {
    setSaving(true);
    try {
      await api("/cnvr", {
        method: "POST",
        body: {
          strayId: row.id,
          vaccineName: form.vaccinationDate ? form.vaccineName : null,
          vaccinationDate: form.vaccinationDate ? new Date(form.vaccinationDate).toISOString() : null,
          sterilizationDate: form.sterilizationDate ? new Date(form.sterilizationDate).toISOString() : null,
          releaseDate: form.releaseDate ? new Date(form.releaseDate).toISOString() : null,
          releaseLatitude: form.releaseDate ? row.latitude : null,
          releaseLongitude: form.releaseDate ? row.longitude : null,
          notes: form.notes || null,
        },
      });
      toast.success("CNVR activity recorded");
      setForm({ vaccineName: form.vaccineName, vaccinationDate: today(), sterilizationDate: "", releaseDate: "", notes: "" });
      await mutate();
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        {row.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.photoUrl} alt="Stray" className="size-24 shrink-0 rounded-xl border border-border object-cover" />
        )}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <StatusPill status={row.cnvr.sterilized ? "VERIFIED" : "PENDING"} label={row.cnvr.sterilized ? "Sterilised" : "Not sterilised"} />
            <StatusPill status={row.cnvr.vaccinated ? "VERIFIED" : "PENDING"} label={row.cnvr.vaccinated ? "Vaccinated" : "Not vaccinated"} />
          </div>
          <p className="text-sm text-fg-soft">{row.physicalDescription ?? "No description"}</p>
          <MapLink lat={row.latitude} lng={row.longitude} />
        </div>
      </div>
      <Section title="Identification">
        <dl className="divide-y divide-border">
          <DetailRow label="Tag / ear mark">{row.tagOrEarMark ?? "—"}</DetailRow>
          <DetailRow label="Species / gender">{titleCase(row.species)} · {titleCase(row.gender)}</DetailRow>
          <DetailRow label="Colour / breed">{[row.color, row.breed].filter(Boolean).join(" · ") || "—"}</DetailRow>
          <DetailRow label="Estimated age">{row.estimatedAge ?? "—"}</DetailRow>
          <DetailRow label="Location">{[row.address, row.wardNumber ? `Ward ${row.wardNumber}` : null, row.municipality].filter(Boolean).join(", ")}</DetailRow>
          <DetailRow label="Registered">{formatDate(row.createdAt)} by {row.registeredBy.rescueOrganization?.organizationName ?? row.registeredBy.fullName}</DetailRow>
        </dl>
      </Section>
      <Section title="CNVR history">
        {!data ? (
          <Skeleton className="h-20 w-full" />
        ) : data.cnvrRecords.length === 0 ? (
          <p className="text-sm text-muted">No CNVR activity recorded yet.</p>
        ) : (
          <Timeline
            items={data.cnvrRecords.map((c) => ({
              key: c.id,
              title: [c.sterilizationDate && "Sterilised", c.vaccinationDate && `Vaccinated (${c.vaccineName})`, c.releaseDate && "Released"].filter(Boolean).join(" · ") || "CNVR activity",
              meta: `${formatDate(c.createdAt)} · ${c.organization.organizationName}`,
              body: c.notes,
              tone: c.sterilizationDate ? "success" : "default",
            }))}
          />
        )}
      </Section>
      {canRecord && (
        <Section title="Record CNVR activity">
          <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
            <Field label="Vaccine">
              <Input value={form.vaccineName} onChange={(e) => setForm({ ...form, vaccineName: e.target.value })} />
            </Field>
            <Field label="Vaccinated on">
              <Input type="date" max={today()} value={form.vaccinationDate} onChange={(e) => setForm({ ...form, vaccinationDate: e.target.value })} />
            </Field>
            <Field label="Sterilised on">
              <Input type="date" max={today()} value={form.sterilizationDate} onChange={(e) => setForm({ ...form, sterilizationDate: e.target.value })} />
            </Field>
            <Field label="Released on" hint="Released at the registered location">
              <Input type="date" max={today()} value={form.releaseDate} onChange={(e) => setForm({ ...form, releaseDate: e.target.value })} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-16" />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button variant="primary" size="sm" onClick={() => void record()} loading={saving} disabled={!form.vaccinationDate && !form.sterilizationDate && !form.releaseDate}>Save CNVR record</Button>
            </div>
          </div>
        </Section>
      )}
      {session.role === "RESCUE_ORG" && session.organizationStatus !== "VERIFIED" && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">Your organisation must be verified by an administrator before recording CNVR activity.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------- register stray

const strayFormSchema = z.object({
  tagOrEarMark: z.string().trim().max(60).optional(),
  gender: z.enum(GENDERS),
  color: z.string().trim().max(60).optional(),
  estimatedAge: z.string().trim().max(40).optional(),
  physicalDescription: z.string().trim().max(1000).optional(),
  address: z.string().trim().max(200).optional(),
  municipality: z.string().optional(),
  wardNumber: z.string().optional().refine((v) => !v || (Number(v) >= 1 && Number(v) <= 35), "Ward must be 1–35"),
});
type StrayForm = z.infer<typeof strayFormSchema>;
type Candidate = { stray: StrayRow & { cnvrCount: number; sterilized: boolean; vaccinated: boolean }; score: number; likelihood: "LIKELY" | "POSSIBLE"; distanceKm: number; reasons: string[] };

export function RegisterStrayDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const { register, handleSubmit, formState, getValues, setValue, reset } = useForm<StrayForm>({ resolver: zodResolver(strayFormSchema), defaultValues: { gender: "UNKNOWN", municipality: "" } });
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [photo, setPhoto] = useState<{ url: string; preview: string } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [ack, setAck] = useState(false);
  const [checking, setChecking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const payload = () => {
    const v = getValues();
    return {
      tagOrEarMark: v.tagOrEarMark || null,
      gender: v.gender,
      color: v.color || null,
      estimatedAge: v.estimatedAge || null,
      physicalDescription: v.physicalDescription || null,
      address: v.address || null,
      municipality: v.municipality || null,
      wardNumber: v.wardNumber ? Number(v.wardNumber) : null,
      photoUrl: photo?.url ?? null,
      latitude: loc?.lat,
      longitude: loc?.lng,
    };
  };

  const check = async () => {
    if (!loc) return toast.error("Pin the location first");
    setChecking(true);
    try {
      const p = payload();
      const r = await api<{ candidates: Candidate[] }>("/strays/duplicates", { method: "POST", body: { ...p, tagOrEarMark: p.tagOrEarMark ?? undefined, color: p.color ?? undefined, physicalDescription: p.physicalDescription ?? undefined, photoUrl: p.photoUrl ?? undefined } });
      setCandidates(r.candidates);
      if (!r.candidates.length) toast.success("No similar records nearby");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const close = () => {
    onOpenChange(false);
    reset();
    setLoc(null);
    setPhoto(null);
    setCandidates(null);
    setAck(false);
  };

  const submit = handleSubmit(async () => {
    if (!loc) return toast.error("Pin the location where the animal lives");
    try {
      await api("/strays", { method: "POST", body: { ...payload(), acknowledgeDuplicates: ack } });
      toast.success("Stray registered");
      close();
      onCreated();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "POSSIBLE_DUPLICATE") {
        setCandidates((err.details as { candidates: Candidate[] }).candidates);
        toast.warning("Possible duplicate — review the matches below");
      } else toast.error(errorMessage(err));
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent
        title="Register a community animal"
        description="Duplicate detection compares tag, location, photo and description with existing records."
        className="max-w-3xl"
        footer={
          <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant="secondary" onClick={() => void check()} loading={checking}><ScanSearch /> Check duplicates</Button>
            <Button variant="primary" onClick={() => void submit()} loading={formState.isSubmitting}>Register</Button>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid content-start gap-3 sm:grid-cols-2">
            <Field label="Tag / ear mark"><Input {...register("tagOrEarMark")} placeholder="KTM-E-0142" /></Field>
            <Field label="Gender"><Select {...register("gender")}>{options(GENDERS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
            <Field label="Colour"><Input {...register("color")} placeholder="brown and white" /></Field>
            <Field label="Estimated age"><Input {...register("estimatedAge")} placeholder="~2 years" /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea {...register("physicalDescription")} className="min-h-16" placeholder="Markings, scars, behaviour…" /></Field>
            <Field label="Nearest landmark" className="sm:col-span-2"><Input {...register("address")} placeholder="Near Kalanki Chowk" /></Field>
            <Field label="Municipality"><MunicipalityInput {...register("municipality")} placeholder="From the pin" /></Field>
            <Field label="Ward" error={formState.errors.wardNumber?.message}><Input type="number" min={1} max={35} {...register("wardNumber")} /></Field>
            <div className="sm:col-span-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border-strong p-2 text-left text-xs text-muted hover:border-fg-soft">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.preview} alt="" className="size-12 rounded-md object-cover" />
                ) : (
                  <ImagePlus className="size-5" />
                )}
                {photo ? "Photo attached — used for photo similarity" : "Add a photo (improves duplicate detection)"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void uploadImage(f, "strays").then((u) => setPhoto({ url: u.url, preview: URL.createObjectURL(f) })).catch((err) => toast.error(errorMessage(err)));
                }}
              />
            </div>
          </div>
          <LocationPicker
            value={loc}
            onChange={(p) => setLoc(p)}
            invalid={formState.isSubmitted && !loc}
            onPlace={(place) => {
              if (place.municipality) setValue("municipality", place.municipality);
              if (place.wardNumber) setValue("wardNumber", String(place.wardNumber) as never);
              if (place.address && !getValues("address")) setValue("address", place.address);
            }}
          />
        </div>
        {candidates && candidates.length > 0 && (
          <div className="mt-4 space-y-2 rounded-xl border border-warning/30 bg-warning/5 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-fg"><AlertTriangle className="size-4 text-warning" /> {candidates.length} similar record{candidates.length > 1 ? "s" : ""} found</p>
            <ul className="space-y-2">
              {candidates.map((c) => (
                <li key={c.stray.id} className="flex items-start gap-3 rounded-lg border border-border bg-surface p-2">
                  {c.stray.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.stray.photoUrl} alt="" className="size-10 rounded-md object-cover" />
                  )}
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="flex items-center gap-2 text-sm font-medium text-fg">
                      {c.stray.tagOrEarMark ?? "Unmarked"} <StatusPill status={c.likelihood} /> <span className="text-muted">{Math.round(c.score * 100)}%</span>
                    </p>
                    <p className="text-muted">{c.reasons.join(" · ")}</p>
                    <p className="text-muted">{c.stray.sterilized ? "Already sterilised" : "Not sterilised"} · {c.stray.vaccinated ? "vaccinated" : "not vaccinated"} · {c.stray.cnvrCount} CNVR record(s)</p>
                  </div>
                </li>
              ))}
            </ul>
            <label className={cn("flex items-center gap-2 text-xs text-fg-soft")}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I reviewed these — this is a different animal
            </label>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ CNVR

export const cnvrColumns: ColumnDef<CnvrRow, unknown>[] = [
  {
    id: "stray",
    header: "Animal",
    enableHiding: false,
    cell: ({ row }) => <TitleCell title={row.original.stray.tagOrEarMark ?? "Unmarked"} subtitle={[titleCase(row.original.stray.gender), row.original.stray.color].filter(Boolean).join(" · ")} image={row.original.stray.photoUrl} />,
    meta: { label: "Animal", exportValue: (r) => r.stray.tagOrEarMark ?? "" },
  },
  { id: "organization", header: "Organisation", cell: ({ row }) => <span className="text-fg-soft">{row.original.organization.organizationName}</span>, meta: { label: "Organisation", exportValue: (r) => r.organization.organizationName } },
  { accessorKey: "vaccinationDate", header: "Vaccinated", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.vaccinationDate} />, meta: { label: "Vaccinated" } },
  { accessorKey: "sterilizationDate", header: "Sterilised", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.sterilizationDate} />, meta: { label: "Sterilised" } },
  { accessorKey: "releaseDate", header: "Released", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.releaseDate} />, meta: { label: "Released" } },
  { accessorKey: "vaccineName", header: "Vaccine", cell: ({ row }) => row.original.vaccineName ?? <span className="text-muted">—</span>, meta: { label: "Vaccine" } },
  { id: "area", header: "Area", cell: ({ row }) => <span className="text-xs text-muted">{row.original.stray.wardNumber ? `Ward ${row.original.stray.wardNumber}, ` : ""}{short(row.original.stray.municipality)}</span>, meta: { label: "Area", exportValue: (r) => r.stray.municipality ?? "" } },
  { accessorKey: "createdAt", header: "Recorded", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.createdAt} relative />, meta: { label: "Recorded" } },
];

export const cnvrFacets: Facet[] = [
  { key: "sterilized", label: "Sterilised", single: true, options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] },
  { key: "vaccinated", label: "Vaccinated", single: true, options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] },
  { key: "released", label: "Released", single: true, options: [{ value: "true", label: "Yes" }, { value: "false", label: "Not yet" }] },
];

export function CnvrInspector({ row, refresh, close }: InspectorProps<CnvrRow>) {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const own = session.role === "ADMIN" || session.organizationId === row.organizationId;
  const remove = async () => {
    if (!confirm("Delete this CNVR record? This cannot be undone.")) return;
    setBusy(true);
    try {
      await api(`/cnvr/${row.id}`, { method: "DELETE" });
      toast.success("CNVR record deleted");
      refresh();
      close();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <dl className="divide-y divide-border">
        <DetailRow label="Animal">{row.stray.tagOrEarMark ?? "Unmarked"} · {titleCase(row.stray.gender)}</DetailRow>
        <DetailRow label="Organisation">{row.organization.organizationName}</DetailRow>
        <DetailRow label="Vaccine">{row.vaccineName ?? "—"}</DetailRow>
        <DetailRow label="Vaccinated">{formatDate(row.vaccinationDate)}</DetailRow>
        <DetailRow label="Sterilised">{formatDate(row.sterilizationDate)}</DetailRow>
        <DetailRow label="Released">{formatDate(row.releaseDate)}</DetailRow>
        <DetailRow label="Release point">{row.releaseLatitude != null && row.releaseLongitude != null ? <MapLink lat={row.releaseLatitude} lng={row.releaseLongitude} label={`${row.releaseLatitude.toFixed(5)}, ${row.releaseLongitude.toFixed(5)}`} /> : "—"}</DetailRow>
        <DetailRow label="Notes">{row.notes}</DetailRow>
      </dl>
      {own && can(session, "RESCUE_ORG") && (
        <div className="flex justify-end">
          <Button variant="danger" size="sm" onClick={() => void remove()} loading={busy}><Trash2 /> Delete record</Button>
        </div>
      )}
    </div>
  );
}
