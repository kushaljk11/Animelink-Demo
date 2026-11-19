"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { ImagePlus, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { Facet } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { StatusPill } from "@/components/ui/status-pill";
import { api, errorMessage, uploadImage } from "@/lib/api";
import { GENDERS, options, SPECIES } from "@/lib/constants";
import { cn, titleCase } from "@/lib/utils";
import { DateCell, TitleCell, YesNo } from "./common";

export type PetRow = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  gender: string;
  dateOfBirth: string | null;
  color: string | null;
  photoUrl: string | null;
  lostStatus: boolean;
  qrToken: string;
  createdAt: string;
  owner: { id: string; fullName: string; phone: string | null; municipality: string | null; wardNumber: number | null };
  vaccination: { status: string; nextDue: string | null; pendingCount: number; rabies: { status: string; boosterDueDate: string | null } | null };
};

const age = (dob: string | null) => {
  if (!dob) return null;
  const months = Math.floor((Date.now() - new Date(dob).getTime()) / (30.44 * 86_400_000));
  return months < 12 ? `${months} mo` : `${Math.floor(months / 12)} yr`;
};

export function petColumns(showOwner: boolean): ColumnDef<PetRow, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: "Pet",
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => <TitleCell title={row.original.name} subtitle={[row.original.breed, age(row.original.dateOfBirth)].filter(Boolean).join(" · ")} image={row.original.photoUrl} />,
      meta: { label: "Pet" },
    },
    { accessorKey: "species", header: "Species", enableSorting: true, cell: ({ row }) => titleCase(row.original.species), meta: { label: "Species" } },
    { accessorKey: "gender", header: "Gender", cell: ({ row }) => titleCase(row.original.gender), meta: { label: "Gender" } },
    {
      id: "vaccination",
      header: "Vaccination",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <StatusPill status={row.original.vaccination.status} />
          {row.original.vaccination.pendingCount > 0 && <span className="text-[11px] text-warning">+{row.original.vaccination.pendingCount} pending</span>}
        </div>
      ),
      meta: { label: "Vaccination", exportValue: (r) => r.vaccination.status },
    },
    { id: "nextDue", header: "Next booster", cell: ({ row }) => <DateCell value={row.original.vaccination.nextDue} />, meta: { label: "Next booster", exportValue: (r) => r.vaccination.nextDue ?? "" } },
    { accessorKey: "lostStatus", header: "Lost", cell: ({ row }) => <YesNo value={row.original.lostStatus} yes="Lost" no="—" danger />, meta: { label: "Lost" } },
    ...(showOwner
      ? ([
          {
            id: "owner",
            header: "Owner",
            cell: ({ row }) => (
              <div>
                <p className="text-fg-soft">{row.original.owner.fullName}</p>
                <p className="text-xs text-muted">{row.original.owner.phone}</p>
              </div>
            ),
            meta: { label: "Owner", exportValue: (r: PetRow) => r.owner.fullName },
          },
        ] as ColumnDef<PetRow, unknown>[])
      : []),
    { accessorKey: "createdAt", header: "Registered", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.createdAt} />, meta: { label: "Registered" } },
  ];
}

export const petFacets: Facet[] = [
  { key: "species", label: "Species", options: options(SPECIES) },
  { key: "lost", label: "Lost", single: true, options: [{ value: "true", label: "Lost" }, { value: "false", label: "At home" }] },
];

// ---------------------------------------------------------------- add pet

const petSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  species: z.enum(SPECIES),
  breed: z.string().trim().max(80).optional(),
  gender: z.enum(GENDERS),
  dateOfBirth: z
    .string()
    .optional()
    .refine((v) => !v || new Date(v).getTime() <= Date.now(), "Date of birth cannot be in the future"),
  color: z.string().trim().max(60).optional(),
  medicalNotes: z.string().trim().max(2000).optional(),
});
type PetForm = z.infer<typeof petSchema>;
type Prediction = { id: string; predictedBreed: string; confidence: number; alternatives: { breed: string; score: number }[]; disclaimer: string };

export function AddPetDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const form = useForm<PetForm>({ resolver: zodResolver(petSchema), defaultValues: { name: "", species: "DOG", gender: "UNKNOWN", breed: "", color: "", medicalNotes: "", dateOfBirth: "" } });
  const { register, handleSubmit, formState, setValue, watch, reset } = form;
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ url: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const breed = watch("breed");
  const species = watch("species");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Photo must be 5 MB or smaller");
    const preview = URL.createObjectURL(file);
    setUploading(true);
    try {
      const up = await uploadImage(file, "pets");
      setPhoto({ url: up.url, preview });
      setPrediction(null);
    } catch (err) {
      URL.revokeObjectURL(preview);
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const suggest = async () => {
    if (!photo) return;
    setPredicting(true);
    try {
      const p = await api<Prediction>("/ai/breed", { method: "POST", body: { imageUrl: photo.url, species } });
      setPrediction(p);
      if (!breed) setValue("breed", p.predictedBreed);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPredicting(false);
    }
  };

  const close = () => {
    onOpenChange(false);
    reset();
    setPhoto(null);
    setPrediction(null);
  };

  const submit = handleSubmit(async (v) => {
    try {
      const pet = await api<{ id: string }>("/pets", {
        method: "POST",
        body: {
          ...v,
          breed: v.breed || null,
          color: v.color || null,
          medicalNotes: v.medicalNotes || null,
          dateOfBirth: v.dateOfBirth ? new Date(v.dateOfBirth).toISOString() : null,
          photoUrl: photo?.url ?? null,
          breedPredictionId: prediction?.id,
        },
      });
      if (prediction) {
        const confirmed = (v.breed ?? "") === prediction.predictedBreed;
        await api(`/ai/breed/${prediction.id}`, { method: "PATCH", body: { confirmed, finalBreed: confirmed ? undefined : v.breed || "Unknown", petId: pet.id } }).catch(() => undefined);
      }
      toast.success(`${v.name} registered — QR code generated`);
      close();
      onCreated(pet.id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent
        title="Register a pet"
        description="Creates a digital profile with a unique QR code. Vaccinations are added by verified clinics."
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button variant="primary" onClick={() => void submit()} loading={formState.isSubmitting}>Register pet</Button>
          </>
        }
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn("relative flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-border-strong bg-surface-2 text-xs text-muted transition hover:border-fg-soft", uploading && "animate-pulse")}
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.preview} alt="Pet preview" className="absolute inset-0 size-full object-cover" />
              ) : (
                <>
                  <ImagePlus className="size-6" />
                  {uploading ? "Uploading…" : "Add a clear photo"}
                </>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            {photo && (
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="secondary" className="flex-1" onClick={() => void suggest()} loading={predicting} disabled={species === "OTHER"}>
                  <Sparkles /> Suggest breed
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => { setPhoto(null); setPrediction(null); }} aria-label="Remove photo"><X /></Button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" error={formState.errors.name?.message} required className="sm:col-span-2">
              <Input {...register("name")} placeholder="e.g. Bhalu" aria-invalid={!!formState.errors.name} />
            </Field>
            <Field label="Species" required>
              <Select {...register("species")}>{options(SPECIES).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
            </Field>
            <Field label="Gender">
              <Select {...register("gender")}>{options(GENDERS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
            </Field>
            <Field label="Breed" className="sm:col-span-2" hint={prediction ? undefined : "Upload a photo to get an AI suggestion"}>
              <Input {...register("breed")} placeholder="e.g. Local Nepali / Mixed breed" />
            </Field>
            {prediction && (
              <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3 sm:col-span-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-fg"><Sparkles className="size-3.5 text-accent" /> Suggestions ({Math.round(prediction.confidence * 100)}% confidence)</p>
                <div className="flex flex-wrap gap-1.5">
                  {[{ breed: prediction.predictedBreed, score: prediction.confidence }, ...prediction.alternatives].map((a) => (
                    <button key={a.breed} type="button" onClick={() => setValue("breed", a.breed)} className={cn("rounded-full border px-2.5 py-1 text-xs transition", breed === a.breed ? "border-fg bg-fg text-bg" : "border-border bg-surface text-fg-soft hover:border-border-strong")}>
                      {a.breed}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted">{prediction.disclaimer}</p>
              </div>
            )}
            <Field label="Date of birth" error={formState.errors.dateOfBirth?.message}>
              <Input type="date" max={new Date().toISOString().slice(0, 10)} {...register("dateOfBirth")} />
            </Field>
            <Field label="Colour">
              <Input {...register("color")} placeholder="e.g. black and tan" />
            </Field>
            <Field label="Medical notes" className="sm:col-span-2" hint="Visible to you and veterinary clinics only — never on the public QR profile.">
              <Textarea {...register("medicalNotes")} className="min-h-20" />
            </Field>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


// --------------------------------------------------------------- edit pet

export type EditablePet = { id: string; name: string; species: string; breed: string | null; gender: string; dateOfBirth: string | null; color: string | null; photoUrl: string | null; medicalNotes: string | null };

/** Owners correct their pet's profile (PUT /pets/:id). The QR code and vaccination history are unaffected. */
export function EditPetDialog({ pet, open, onOpenChange, onSaved }: { pet: EditablePet; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const defaults = (): PetForm => ({
    name: pet.name,
    species: pet.species as PetForm["species"],
    gender: pet.gender as PetForm["gender"],
    breed: pet.breed ?? "",
    color: pet.color ?? "",
    medicalNotes: pet.medicalNotes ?? "",
    dateOfBirth: pet.dateOfBirth ? pet.dateOfBirth.slice(0, 10) : "",
  });
  const { register, handleSubmit, formState, reset } = useForm<PetForm>({ resolver: zodResolver(petSchema), defaultValues: defaults() });
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ url: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const openChange = (o: boolean) => {
    if (o) {
      reset(defaults());
      setPhoto(null);
    }
    onOpenChange(o);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Photo must be 5 MB or smaller");
    setUploading(true);
    try {
      const up = await uploadImage(file, "pets");
      setPhoto({ url: up.url, preview: URL.createObjectURL(file) });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const submit = handleSubmit(async (v) => {
    try {
      await api(`/pets/${pet.id}`, {
        method: "PUT",
        body: {
          ...v,
          breed: v.breed || null,
          color: v.color || null,
          medicalNotes: v.medicalNotes || null,
          dateOfBirth: v.dateOfBirth ? new Date(v.dateOfBirth).toISOString() : null,
          ...(photo ? { photoUrl: photo.url } : {}),
        },
      });
      toast.success(`${v.name}'s profile updated`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  const preview = photo?.preview ?? pet.photoUrl;
  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogContent
        title={`Edit ${pet.name}`}
        description="Keep the profile accurate. It helps finders and vets identify your pet."
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void submit()} loading={formState.isSubmitting} disabled={uploading}>Save changes</Button>
          </>
        }
      >
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn("relative flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-border-strong bg-surface-2 text-xs text-muted transition hover:border-fg-soft", uploading && "animate-pulse")}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt={pet.name} className="absolute inset-0 size-full object-cover" />
              ) : (
                <>
                  <ImagePlus className="size-6" />
                  {uploading ? "Uploading…" : "Add a photo"}
                </>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            <p className="text-center text-[11px] text-muted">{preview ? "Click the photo to replace it" : "JPG, PNG or WebP · 5 MB max"}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" error={formState.errors.name?.message} required className="sm:col-span-2">
              <Input {...register("name")} aria-invalid={!!formState.errors.name} />
            </Field>
            <Field label="Species" required>
              <Select {...register("species")}>{options(SPECIES).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
            </Field>
            <Field label="Gender">
              <Select {...register("gender")}>{options(GENDERS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
            </Field>
            <Field label="Breed" className="sm:col-span-2">
              <Input {...register("breed")} placeholder="e.g. Local Nepali / Mixed breed" />
            </Field>
            <Field label="Date of birth" error={formState.errors.dateOfBirth?.message}>
              <Input type="date" max={new Date().toISOString().slice(0, 10)} {...register("dateOfBirth")} />
            </Field>
            <Field label="Colour">
              <Input {...register("color")} />
            </Field>
            <Field label="Medical notes" className="sm:col-span-2" hint="Visible to you and veterinary clinics only.">
              <Textarea {...register("medicalNotes")} className="min-h-20" />
            </Field>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
