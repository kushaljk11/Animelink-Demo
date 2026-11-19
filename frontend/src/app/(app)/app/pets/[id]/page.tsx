"use client";

import { ArrowLeft, Download, ExternalLink, FileBadge2, MapPin, MessageSquare, PawPrint, Pencil, QrCode, Search, Syringe } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { NewConversationDialog } from "@/components/chat/Messages";
import { DateCell, MapLink, Section, Timeline } from "@/components/entities/common";
import { EditPetDialog } from "@/components/entities/pets";
import { LocationPicker } from "@/components/maps/LocationPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { Avatar, Card, CardHeader, DetailRow, EmptyState, Field, Input, Select, Skeleton, Textarea } from "@/components/ui/primitives";
import { StatusPill } from "@/components/ui/status-pill";
import { api, apiUrl, errorMessage, type Paginated } from "@/lib/api";
import { useSession } from "@/lib/client/session";
import type { LatLng } from "@/lib/geo";
import { formatDate, formatDateTime, timeAgo, titleCase } from "@/lib/utils";

type Rec = { id: string; vaccineName: string; batchNumber: string; administeredDate: string; boosterDueDate: string | null; status: string; verifiedAt: string | null; notes: string | null; clinic: { id: string; clinicName: string; registrationNumber: string; phone: string } };
type PetDetail = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  gender: string;
  dateOfBirth: string | null;
  color: string | null;
  photoUrl: string | null;
  medicalNotes: string | null;
  qrToken: string;
  lostStatus: boolean;
  createdAt: string;
  owner: { id: string; fullName: string; phone: string | null; email: string; municipality: string | null; wardNumber: number | null };
  vaccinationRecords: Rec[];
  lostPetReports: { id: string; status: string; lastSeenDate: string; lastSeenLatitude: number | null; lastSeenLongitude: number | null; description: string | null; createdAt: string; resolvedAt: string | null }[];
  qrScanEvents?: { id: string; scannedAt: string; sharedLatitude: number | null; sharedLongitude: number | null; locationPermission: boolean; finderMessage: string | null; finderContact: string | null; deviceOrSessionInfo: string | null }[];
  vaccination: { status: string; nextDue: string | null; pendingCount: number; vaccines: { vaccine: string; administeredDate: string; boosterDueDate: string | null; status: string; daysUntilDue: number | null }[] };
};

const today = () => new Date().toISOString().slice(0, 10);
const plusYear = (d: string) => {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + 1);
  return x.toISOString().slice(0, 10);
};

function VaccinationDialog({ pet, open, onOpenChange, onSaved, mode }: { pet: PetDetail; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void; mode: "vet" | "owner" }) {
  const [form, setForm] = useState({ vaccineName: "Rabisin (Rabies)", batchNumber: "", administeredDate: today(), boosterDueDate: plusYear(today()), notes: "", verify: true, clinicId: "" });
  const [saving, setSaving] = useState(false);
  const { data: clinics } = useSWR<Paginated<{ id: string; clinicName: string; address: string }>>(mode === "owner" && open ? "/clinics?limit=100&sort=clinicName&order=asc" : null);
  const save = async () => {
    setSaving(true);
    try {
      await api("/vaccinations", {
        method: "POST",
        body: {
          petId: pet.id,
          vaccineName: form.vaccineName,
          batchNumber: form.batchNumber,
          administeredDate: new Date(form.administeredDate).toISOString(),
          boosterDueDate: form.boosterDueDate ? new Date(form.boosterDueDate).toISOString() : null,
          notes: form.notes || null,
          ...(mode === "vet" ? { verify: form.verify } : { clinicId: form.clinicId }),
        },
      });
      toast.success(mode === "vet" ? (form.verify ? "Vaccination recorded and verified" : "Vaccination recorded (pending)") : "Submitted — the clinic will verify it");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={mode === "vet" ? `Record vaccination · ${pet.name}` : `Submit a paper record · ${pet.name}`}
        description={mode === "vet" ? "Recorded under your verified clinic." : "The clinic that gave the vaccine must verify it before it counts toward status."}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!form.batchNumber || !form.vaccineName || (mode === "owner" && !form.clinicId)}>Save</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vaccine" required className="sm:col-span-2">
            <Input list="vaccines" value={form.vaccineName} onChange={(e) => setForm({ ...form, vaccineName: e.target.value })} />
            <datalist id="vaccines">
              {["Rabisin (Rabies)", "Nobivac Rabies", "Raksharab", "Defensor 3 (Rabies)", "Nobivac DHPPi", "Vanguard Plus 5/L", "Canigen DHPPi/L", "Feligen CRP", "Nobivac Tricat Trio"].map((v) => <option key={v} value={v} />)}
            </datalist>
          </Field>
          <Field label="Batch number" required><Input value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value.toUpperCase() })} placeholder="RB26K1234" /></Field>
          <Field label="Administered" required><Input type="date" max={today()} value={form.administeredDate} onChange={(e) => setForm({ ...form, administeredDate: e.target.value, boosterDueDate: plusYear(e.target.value) })} /></Field>
          <Field label="Booster due" hint="Defaults to one year later"><Input type="date" value={form.boosterDueDate} onChange={(e) => setForm({ ...form, boosterDueDate: e.target.value })} /></Field>
          {mode === "owner" && (
            <Field label="Clinic that administered it" required>
              <Select value={form.clinicId} onChange={(e) => setForm({ ...form, clinicId: e.target.value })}>
                <option value="">Choose a verified clinic…</option>
                {clinics?.data.map((c) => <option key={c.id} value={c.id}>{c.clinicName}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-16" /></Field>
          {mode === "vet" && (
            <label className="flex items-center gap-2 text-sm text-fg-soft sm:col-span-2">
              <input type="checkbox" checked={form.verify} onChange={(e) => setForm({ ...form, verify: e.target.checked })} /> Verify now (batch checked against clinic register)
            </label>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LostDialog({ pet, open, onOpenChange, onSaved }: { pet: PetDetail; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api(`/pets/${pet.id}/lost`, {
        method: "POST",
        body: { lastSeenDate: new Date(date).toISOString(), description: description || null, lastSeenLatitude: loc?.lat ?? null, lastSeenLongitude: loc?.lng ?? null },
      });
      toast.success(`${pet.name} is in lost mode — your phone now shows on the QR profile`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Mark ${pet.name} as lost`}
        description="Anyone who scans the QR tag will see your phone number and can share where they found your pet. The public map shows only an approximate area."
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void save()} loading={saving}>Activate lost mode</Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <Field label="Last seen on" required><Input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Collar colour, where it was heading, temperament…" /></Field>
          </div>
          <Field label="Last seen location (optional)"><LocationPicker value={loc} onChange={(p) => setLoc(p)} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = useSession();
  const { data: pet, error, mutate } = useSWR<PetDetail>(`/pets/${id}`);
  const [vacOpen, setVacOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <EmptyState icon={<PawPrint />} title="Pet not found" description={errorMessage(error)} action={<Button asChild size="sm"><Link href="/app/pets">Back to pets</Link></Button>} />;
  if (!pet) return <div className="mx-auto max-w-6xl space-y-4 p-6"><Skeleton className="h-28 w-full" /><Skeleton className="h-72 w-full" /></div>;

  const isOwner = session.role === "ADMIN" || pet.owner.id === session.id;
  const isVet = session.role === "VET_CLINIC";
  const canVaccinate = isVet && session.clinicStatus === "VERIFIED";

  const found = async () => {
    setBusy(true);
    try {
      await api(`/pets/${pet.id}/found`, { method: "POST", body: {} });
      toast.success(`Welcome home, ${pet.name}! Lost mode is off.`);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const saveNotes = async () => {
    setBusy(true);
    try {
      await api(`/pets/${pet.id}`, { method: "PUT", body: { medicalNotes: notes || null } });
      toast.success("Medical notes updated");
      setNotes(null);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <Link href="/app/pets" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Pets</Link>

      <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <Avatar name={pet.name} src={pet.photoUrl} className="size-24 rounded-2xl text-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{pet.name}</h1>
            <StatusPill status={pet.vaccination.status} />
            {pet.lostStatus && <StatusPill status="ACTIVE" label="Lost — QR alerts on" />}
          </div>
          <p className="text-sm text-muted">{[titleCase(pet.species), pet.breed, titleCase(pet.gender), pet.color, pet.dateOfBirth ? `born ${formatDate(pet.dateOfBirth)}` : null].filter(Boolean).join(" · ")}</p>
          <p className="text-xs text-muted">Owner: {pet.owner.fullName}{!isOwner && pet.owner.phone ? ` · ${pet.owner.phone}` : ""} · registered {formatDate(pet.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canVaccinate && <Button variant="primary" onClick={() => setVacOpen(true)}><Syringe /> Record vaccination</Button>}
          {isOwner && session.role !== "VET_CLINIC" && <Button variant="secondary" onClick={() => setVacOpen(true)}><Syringe /> Submit paper record</Button>}
          {isOwner && <Button variant="secondary" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>}
          {session.role === "PET_OWNER" && isOwner && <Button variant="secondary" onClick={() => setChatOpen(true)}><MessageSquare /> Message a vet</Button>}
          <Button asChild variant="secondary"><a href={apiUrl(`/pets/${pet.id}/certificate`)}><FileBadge2 /> Certificate</a></Button>
          {isOwner && (pet.lostStatus ? <Button variant="success" onClick={() => void found()} loading={busy}>Mark as found</Button> : <Button variant="danger" onClick={() => setLostOpen(true)}><Search /> Mark as lost</Button>)}
        </div>
      </Card>

      {isVet && !canVaccinate && <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">Your clinic must be verified before you can record vaccinations.</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Vaccination status" description={pet.vaccination.nextDue ? `Next booster ${formatDate(pet.vaccination.nextDue)} (${timeAgo(pet.vaccination.nextDue)})` : "No upcoming booster"} />
            {pet.vaccination.vaccines.length === 0 ? (
              <EmptyState icon={<Syringe />} title="No verified vaccinations" description={pet.vaccination.pendingCount ? `${pet.vaccination.pendingCount} record(s) awaiting clinic verification.` : "Visit a registered clinic to vaccinate and record it here."} />
            ) : (
              <ul className="divide-y divide-border">
                {pet.vaccination.vaccines.map((v) => (
                  <li key={v.vaccine} className="flex items-center gap-3 px-5 py-3">
                    <Syringe className="size-4 text-muted" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-fg">{v.vaccine}</p>
                      <p className="text-xs text-muted">Given {formatDate(v.administeredDate)} · booster {formatDate(v.boosterDueDate)}{v.daysUntilDue !== null ? ` (${v.daysUntilDue >= 0 ? `in ${v.daysUntilDue} days` : `${-v.daysUntilDue} days ago`})` : ""}</p>
                    </div>
                    <StatusPill status={v.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Vaccination history" description="Only clinic-verified records count toward status and the certificate" />
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
                  <tr>{["Vaccine", "Batch", "Given", "Booster", "Clinic", "Record"].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold first:pl-5">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pet.vaccinationRecords.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2.5 pl-5 text-fg">{r.vaccineName}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted">{r.batchNumber}</td>
                      <td className="px-3 py-2.5"><DateCell value={r.administeredDate} /></td>
                      <td className="px-3 py-2.5"><DateCell value={r.boosterDueDate} /></td>
                      <td className="px-3 py-2.5 text-fg-soft">{r.clinic.clinicName}</td>
                      <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pet.vaccinationRecords.length === 0 && <EmptyState title="No records yet" />}
            </div>
          </Card>

          {isOwner && pet.qrScanEvents && (
            <Card>
              <CardHeader title="QR tag scans" description="Finders who scanned the tag. Locations are only shared with your permission." />
              {pet.qrScanEvents.length === 0 ? (
                <EmptyState icon={<QrCode />} title="No scans yet" />
              ) : (
                <div className="p-5">
                  <Timeline
                    items={pet.qrScanEvents.map((s) => ({
                      key: s.id,
                      title: s.locationPermission ? "Scanned — location shared" : "Scanned",
                      meta: `${formatDateTime(s.scannedAt)} · ${s.deviceOrSessionInfo ?? "unknown device"}`,
                      tone: s.locationPermission ? "success" : "default",
                      body: (
                        <div className="space-y-1">
                          {s.finderMessage && <p>&ldquo;{s.finderMessage}&rdquo;</p>}
                          {s.finderContact && <p className="text-xs">Finder contact: <a href={`tel:${s.finderContact}`} className="text-accent">{s.finderContact}</a></p>}
                          {s.sharedLatitude != null && s.sharedLongitude != null && <MapLink lat={s.sharedLatitude} lng={s.sharedLongitude} label="Open shared location" />}
                        </div>
                      ),
                    }))}
                  />
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card className="p-5 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={apiUrl(`/pets/${pet.id}/qr?size=320`)} alt={`QR code for ${pet.name}`} className="mx-auto size-48 rounded-xl border border-border bg-white p-2" />
            <p className="mt-3 text-sm font-medium text-fg">Public emergency profile</p>
            <p className="text-xs text-muted">Print this on a collar tag. It shows name, photo and vaccination status{pet.lostStatus ? " — and your phone while lost" : ""}.</p>
            <div className="mt-3 flex justify-center gap-2">
              <Button asChild size="sm" variant="secondary"><a href={apiUrl(`/pets/${pet.id}/qr?download=1&size=1024`)}><Download /> PNG</a></Button>
              <Button asChild size="sm" variant="secondary"><a href={apiUrl(`/pets/${pet.id}/qr?download=1&format=svg`)}><Download /> SVG</a></Button>
              <Button asChild size="sm" variant="ghost"><a href={`/p/${pet.qrToken}`} target="_blank" rel="noreferrer"><ExternalLink /> Open</a></Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Medical notes" description="Private — owner and vets only" />
            <div className="space-y-2 p-5">
              {notes === null ? (
                <>
                  <p className="whitespace-pre-line text-sm text-fg-soft">{pet.medicalNotes ?? <span className="text-muted">No notes</span>}</p>
                  {(isOwner || isVet) && <Button size="sm" variant="ghost" onClick={() => setNotes(pet.medicalNotes ?? "")}>Edit notes</Button>}
                </>
              ) : (
                <>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-28" maxLength={2000} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setNotes(null)}>Cancel</Button>
                    <Button size="sm" variant="primary" onClick={() => void saveNotes()} loading={busy}>Save</Button>
                  </div>
                </>
              )}
            </div>
          </Card>

          {pet.lostPetReports.length > 0 && (
            <Card>
              <CardHeader title="Lost reports" />
              <div className="p-5">
                <Section title="History">
                  <ul className="space-y-3">
                    {pet.lostPetReports.map((r) => (
                      <li key={r.id} className="space-y-1 text-sm">
                        <div className="flex items-center gap-2"><StatusPill status={r.status} /> <span className="text-xs text-muted">last seen {formatDate(r.lastSeenDate)}</span></div>
                        {r.description && <p className="text-xs text-fg-soft">{r.description}</p>}
                        {r.lastSeenLatitude != null && r.lastSeenLongitude != null && <MapLink lat={r.lastSeenLatitude} lng={r.lastSeenLongitude} label="Last seen location" />}
                      </li>
                    ))}
                  </ul>
                </Section>
              </div>
            </Card>
          )}

          <Card>
            <dl className="divide-y divide-border px-5 py-2">
              <DetailRow label="Owner area">{[pet.owner.wardNumber ? `Ward ${pet.owner.wardNumber}` : null, pet.owner.municipality].filter(Boolean).join(", ") || "—"}</DetailRow>
              <DetailRow label="QR token"><span className="font-mono text-xs">{pet.qrToken}</span></DetailRow>
              <DetailRow label="Nearby help"><Link href="/nearby" className="inline-flex items-center gap-1 text-accent"><MapPin className="size-3.5" /> Vets & shelters</Link></DetailRow>
            </dl>
          </Card>
        </div>
      </div>

      <VaccinationDialog pet={pet} open={vacOpen} onOpenChange={setVacOpen} onSaved={() => void mutate()} mode={canVaccinate ? "vet" : "owner"} />
      {isOwner && <LostDialog pet={pet} open={lostOpen} onOpenChange={setLostOpen} onSaved={() => void mutate()} />}
      {isOwner && <EditPetDialog pet={pet} open={editOpen} onOpenChange={setEditOpen} onSaved={() => void mutate()} />}
      {session.role === "PET_OWNER" && <NewConversationDialog open={chatOpen} onOpenChange={setChatOpen} petId={pet.id} />}
    </div>
  );
}
