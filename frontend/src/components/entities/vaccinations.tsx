"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ShieldCheck, ShieldX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { runEach, type BulkAction, type Facet, type InspectorProps } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/button";
import { DetailRow, Field, Textarea } from "@/components/ui/primitives";
import { StatusPill } from "@/components/ui/status-pill";
import { api, errorMessage } from "@/lib/api";
import { useSession, type ClientSession } from "@/lib/client/session";
import { BOOSTER_STATUSES, options, VACCINATION_STATUSES } from "@/lib/constants";
import { formatDate, formatDateTime, titleCase } from "@/lib/utils";
import { DateCell, Section, TitleCell } from "./common";

export type VaccinationRow = {
  id: string;
  vaccineName: string;
  batchNumber: string;
  administeredDate: string;
  boosterDueDate: string | null;
  status: string;
  boosterStatus: string;
  verifiedAt: string | null;
  notes: string | null;
  vetId: string;
  createdAt: string;
  pet: { id: string; name: string; species: string; photoUrl: string | null; owner: { id: string; fullName: string } };
  clinic: { id: string; clinicName: string; registrationNumber: string };
  recordedBy: { id: string; fullName: string } | null;
};

export const vaccinationColumns: ColumnDef<VaccinationRow, unknown>[] = [
  {
    id: "pet",
    header: "Pet",
    enableHiding: false,
    cell: ({ row }) => <TitleCell title={row.original.pet.name} subtitle={`${titleCase(row.original.pet.species)} · ${row.original.pet.owner.fullName}`} image={row.original.pet.photoUrl} />,
    meta: { label: "Pet", exportValue: (r) => r.pet.name },
  },
  {
    accessorKey: "vaccineName",
    header: "Vaccine",
    enableSorting: true,
    cell: ({ row }) => (
      <div>
        <p className="text-fg">{row.original.vaccineName}</p>
        <p className="font-mono text-[11px] text-muted">Batch {row.original.batchNumber}</p>
      </div>
    ),
    meta: { label: "Vaccine" },
  },
  { accessorKey: "administeredDate", header: "Given", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.administeredDate} />, meta: { label: "Given" } },
  { accessorKey: "boosterDueDate", header: "Booster due", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.boosterDueDate} />, meta: { label: "Booster due" } },
  { accessorKey: "boosterStatus", header: "Booster", cell: ({ row }) => (row.original.status === "VERIFIED" ? <StatusPill status={row.original.boosterStatus} /> : <span className="text-xs text-muted">—</span>), meta: { label: "Booster status" } },
  { accessorKey: "status", header: "Record", cell: ({ row }) => <StatusPill status={row.original.status} />, meta: { label: "Record status" } },
  { id: "clinic", header: "Clinic", cell: ({ row }) => <span className="text-fg-soft">{row.original.clinic.clinicName}</span>, meta: { label: "Clinic", exportValue: (r) => r.clinic.clinicName } },
  { accessorKey: "verifiedAt", header: "Verified", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.verifiedAt} relative />, meta: { label: "Verified" } },
];

export const vaccinationFacets: Facet[] = [
  { key: "status", label: "Record", options: options(VACCINATION_STATUSES) },
  { key: "boosterStatus", label: "Booster", options: options(BOOSTER_STATUSES) },
];

export function vaccinationBulkActions(session: ClientSession): BulkAction<VaccinationRow>[] {
  if (session.role !== "VET_CLINIC" && session.role !== "ADMIN") return [];
  return [
    {
      id: "verify",
      label: "Verify",
      icon: ShieldCheck,
      variant: "success",
      run: (rows) => {
        const eligible = rows.filter((r) => r.status === "PENDING_VERIFICATION" && (session.role === "ADMIN" || r.vetId === session.clinicId));
        if (!eligible.length) throw new Error("Select pending records addressed to your clinic");
        return runEach(eligible, (r) => api(`/vaccinations/${r.id}/verify`, { method: "POST", body: { decision: "VERIFY" } }), "Verified");
      },
    },
  ];
}

export function VaccinationInspector({ row, refresh, close }: InspectorProps<VaccinationRow>) {
  const session = useSession();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const ownClinic = session.role === "ADMIN" || (session.role === "VET_CLINIC" && session.clinicId === row.vetId);

  const decide = async (decision: "VERIFY" | "REVOKE") => {
    setBusy(decision);
    try {
      await api(`/vaccinations/${row.id}/verify`, { method: "POST", body: { decision, notes: notes || undefined } });
      toast.success(decision === "VERIFY" ? "Record verified" : "Record revoked");
      refresh();
      close();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <StatusPill status={row.status} />
        {row.status === "VERIFIED" && <StatusPill status={row.boosterStatus} />}
      </div>
      <Section title="Record">
        <dl className="divide-y divide-border">
          <DetailRow label="Pet"><Link href={`/app/pets/${row.pet.id}`} className="text-accent hover:underline">{row.pet.name}</Link> · {row.pet.owner.fullName}</DetailRow>
          <DetailRow label="Vaccine">{row.vaccineName}</DetailRow>
          <DetailRow label="Batch number"><span className="font-mono">{row.batchNumber}</span></DetailRow>
          <DetailRow label="Administered">{formatDate(row.administeredDate)}</DetailRow>
          <DetailRow label="Booster due">{formatDate(row.boosterDueDate)}</DetailRow>
          <DetailRow label="Clinic">{row.clinic.clinicName} ({row.clinic.registrationNumber})</DetailRow>
          <DetailRow label="Recorded by">{row.recordedBy?.fullName ?? "Owner submission"}</DetailRow>
          <DetailRow label="Verified">{row.verifiedAt ? formatDateTime(row.verifiedAt) : "—"}</DetailRow>
        </dl>
      </Section>
      {row.notes && (
        <Section title="Notes">
          <p className="whitespace-pre-line rounded-lg border border-border bg-surface-2 p-3 text-sm text-fg-soft">{row.notes}</p>
        </Section>
      )}
      {ownClinic && row.status !== "REVOKED" && (
        <Section title={row.status === "PENDING_VERIFICATION" ? "Verify this record" : "Revoke this record"}>
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs text-muted">
              {row.status === "PENDING_VERIFICATION"
                ? "Check the batch number against your clinic register before verifying. Verified records count toward the pet's status and certificate."
                : "Revoked records stay in the history but no longer count toward the pet's vaccination status."}
            </p>
            <Field label="Note">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" maxLength={500} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="danger" size="sm" onClick={() => void decide("REVOKE")} loading={busy === "REVOKE"} disabled={!!busy}>
                <ShieldX /> Revoke
              </Button>
              {row.status === "PENDING_VERIFICATION" && (
                <Button variant="success" size="sm" onClick={() => void decide("VERIFY")} loading={busy === "VERIFY"} disabled={!!busy}>
                  <ShieldCheck /> Verify
                </Button>
              )}
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
