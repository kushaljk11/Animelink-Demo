import { Phone, ShieldCheck, Syringe } from "lucide-react";
import { notFound } from "next/navigation";
import { FinderForm } from "@/components/portal/FinderForm";
import { Avatar, Card } from "@/components/ui/primitives";
import { StatusPill } from "@/components/ui/status-pill";
import { serverApi } from "@/lib/server-api";
import { formatDate, titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pet emergency profile", robots: { index: false, follow: false } };

/** Shape of GET /api/public/pets/:token (owner phone present only while the pet is lost). */
type PublicPet = {
  name: string;
  species: string;
  breed: string | null;
  gender: string;
  color: string | null;
  photoUrl: string | null;
  ageYears: number | null;
  lostStatus: boolean;
  lost: { since: string; description: string | null } | null;
  vaccination: {
    status: string;
    rabies: { status: string; administeredDate: string; boosterDueDate: string | null; clinicName: string | null } | null;
    verifiedCount: number;
  };
  owner: { firstName: string; phone: string | null; contactVisible: boolean };
};

/** Public emergency profile behind a pet's QR tag (Sections H.4, H.8, U). */
export default async function PublicPetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const r = await serverApi<PublicPet>(`/public/pets/${encodeURIComponent(token)}`);
  if (!r.ok) notFound();
  const p = r.data;

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-8">
      {p.lostStatus && (
        <div className="flex items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4">
          <span className="size-2.5 animate-pulse-dot rounded-full bg-danger text-danger" />
          <p className="text-sm font-medium text-fg">This pet is reported <strong>LOST</strong>{p.lost ? ` since ${formatDate(p.lost.since)}` : ""}. Please contact the owner.</p>
        </div>
      )}
      <Card className="p-6 text-center">
        <Avatar name={p.name} src={p.photoUrl} className="mx-auto size-28 rounded-2xl text-3xl" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-fg">{p.name}</h1>
        <p className="text-sm text-muted">{[titleCase(p.species), p.breed, titleCase(p.gender), p.color, p.ageYears !== null ? `${p.ageYears} yr` : null].filter(Boolean).join(" · ")}</p>
        {p.lost?.description && <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm text-fg-soft">{p.lost.description}</p>}
        {p.owner.contactVisible && p.owner.phone ? (
          <a href={`tel:${p.owner.phone}`} className="mt-5 inline-flex h-12 items-center gap-2 rounded-xl bg-danger px-6 text-base font-semibold text-white shadow-card hover:opacity-90">
            <Phone className="size-5" /> Call {p.owner.firstName} · {p.owner.phone}
          </a>
        ) : (
          <p className="mt-4 text-xs text-muted">Owner: {p.owner.firstName}. Contact details are private — send a message below and the owner will be notified.</p>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-fg"><Syringe className="size-4 text-muted" /> Vaccination</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPill status={p.vaccination.status} />
          <span className="text-xs text-muted">{p.vaccination.verifiedCount} clinic-verified record{p.vaccination.verifiedCount === 1 ? "" : "s"}</span>
        </div>
        {p.vaccination.rabies ? (
          <p className="mt-3 flex items-start gap-2 text-sm text-fg-soft">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
            Rabies vaccine given {formatDate(p.vaccination.rabies.administeredDate)}{p.vaccination.rabies.clinicName ? ` at ${p.vaccination.rabies.clinicName}` : ""}; booster due {formatDate(p.vaccination.rabies.boosterDueDate)}.
          </p>
        ) : (
          <p className="mt-3 text-sm text-warning">No verified rabies vaccination on record. If this animal bit someone, seek medical care immediately.</p>
        )}
      </Card>

      <FinderForm token={token} petName={p.name} lost={p.lostStatus} />
    </div>
  );
}
