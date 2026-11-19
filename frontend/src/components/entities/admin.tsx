"use client";

// Directory (clinics / rescue organisations), users and audit log entities.
import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, Ban, MessageSquare, Phone, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MunicipalityInput } from "@/components/forms/MunicipalityInput";
import { NewConversationDialog } from "@/components/chat/Messages";
import type { Facet, InspectorProps } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/button";
import { DetailRow, Field, Select, Textarea } from "@/components/ui/primitives";
import { StatusPill } from "@/components/ui/status-pill";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/client/session";
import { options, ROLE_LABEL, VERIFICATION_STATUSES, type Role } from "@/lib/constants";
import { formatDateTime, titleCase } from "@/lib/utils";
import { DateCell, MapLink, Section, TitleCell, YesNo } from "./common";

const short = (m: string | null) => m?.replace(" Metropolitan City", "").replace(" Municipality", "") ?? "";

// -------------------------------------------------------------- directory

export type DirectoryRow = {
  id: string;
  clinicName?: string;
  organizationName?: string;
  registrationNumber?: string;
  hasShelter?: boolean;
  phone: string;
  address: string;
  wardNumber: number | null;
  municipality: string | null;
  latitude: number;
  longitude: number;
  openingHours?: string | null;
  serviceRadiusKm: number;
  verificationStatus: string;
  createdAt: string;
  user?: { id: string; fullName: string; email: string };
  _count?: { vaccinationRecords?: number; cnvrRecords?: number };
};

export const directoryName = (r: DirectoryRow) => r.clinicName ?? r.organizationName ?? "—";

export function directoryColumns(kind: "clinics" | "organizations", privileged: boolean): ColumnDef<DirectoryRow, unknown>[] {
  return [
    {
      accessorKey: kind === "clinics" ? "clinicName" : "organizationName",
      header: "Name",
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => <TitleCell title={directoryName(row.original)} subtitle={kind === "clinics" ? row.original.registrationNumber : row.original.hasShelter ? "Shelter" : "Field rescue"} name={directoryName(row.original)} />,
      meta: { label: "Name", exportValue: directoryName },
    },
    { id: "address", header: "Address", cell: ({ row }) => <span className="line-clamp-1 max-w-xs text-fg-soft">{row.original.address}</span>, meta: { label: "Address", exportValue: (r) => r.address } },
    { accessorKey: "municipality", header: "Area", enableSorting: true, cell: ({ row }) => <span className="text-xs text-muted">{row.original.wardNumber ? `Ward ${row.original.wardNumber}, ` : ""}{short(row.original.municipality)}</span>, meta: { label: "Area" } },
    { accessorKey: "phone", header: "Phone", cell: ({ row }) => <a href={`tel:${row.original.phone}`} className="text-fg-soft hover:text-accent" onClick={(e) => e.stopPropagation()}>{row.original.phone}</a>, meta: { label: "Phone" } },
    ...(kind === "clinics" ? ([{ accessorKey: "openingHours", header: "Hours", cell: ({ row }) => <span className="text-xs text-muted">{row.original.openingHours ?? "—"}</span>, meta: { label: "Hours" } }] as ColumnDef<DirectoryRow, unknown>[]) : []),
    { accessorKey: "verificationStatus", header: "Status", enableSorting: true, cell: ({ row }) => <StatusPill status={row.original.verificationStatus} />, meta: { label: "Status" } },
    ...(privileged
      ? ([
          {
            id: "activity",
            header: kind === "clinics" ? "Vaccinations" : "CNVR",
            cell: ({ row }) => <span className="tabular-nums text-fg-soft">{row.original._count?.vaccinationRecords ?? row.original._count?.cnvrRecords ?? 0}</span>,
            meta: { label: "Activity", exportValue: (r: DirectoryRow) => r._count?.vaccinationRecords ?? r._count?.cnvrRecords ?? 0 },
          },
          { accessorKey: "createdAt", header: "Joined", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.createdAt} />, meta: { label: "Joined" } },
        ] as ColumnDef<DirectoryRow, unknown>[])
      : []),
  ];
}

export function directoryFacets(privileged: boolean, municipalities: { value: string; label: string }[] = []): Facet[] {
  return [
    ...(privileged ? [{ key: "status", label: "Status", options: options(VERIFICATION_STATUSES) }] : []),
    ...(municipalities.length ? [{ key: "municipality", label: "Municipality", single: true, options: municipalities }] : []),
  ];
}

export function DirectoryInspector({ row, refresh, close, kind }: InspectorProps<DirectoryRow> & { kind: "clinics" | "organizations" }) {
  const session = useSession();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const decide = async (status: "VERIFIED" | "REJECTED" | "SUSPENDED") => {
    setBusy(status);
    try {
      await api(`/${kind}/${row.id}/verification`, { method: "POST", body: { status, note: note || undefined } });
      toast.success(`${directoryName(row)} marked ${status.toLowerCase()}`);
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
      <div className="flex items-center gap-2">
        <StatusPill status={row.verificationStatus} />
        <span className="text-xs text-muted">Service radius {row.serviceRadiusKm} km</span>
      </div>
      {session.role === "PET_OWNER" && (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary"><a href={`tel:${row.phone}`}><Phone /> Call</a></Button>
          {kind === "clinics" && row.verificationStatus === "VERIFIED" && <Button size="sm" variant="primary" onClick={() => setChatOpen(true)}><MessageSquare /> Message clinic</Button>}
        </div>
      )}
      {session.role === "PET_OWNER" && kind === "clinics" && <NewConversationDialog open={chatOpen} onOpenChange={setChatOpen} clinicId={row.id} />}
      <dl className="divide-y divide-border">
        {row.registrationNumber && <DetailRow label="Registration">{row.registrationNumber}</DetailRow>}
        <DetailRow label="Address">{row.address}</DetailRow>
        <DetailRow label="Area">{[row.wardNumber ? `Ward ${row.wardNumber}` : null, row.municipality].filter(Boolean).join(", ")}</DetailRow>
        <DetailRow label="Phone"><a href={`tel:${row.phone}`} className="text-accent">{row.phone}</a></DetailRow>
        {row.openingHours && <DetailRow label="Hours">{row.openingHours}</DetailRow>}
        {row.hasShelter !== undefined && <DetailRow label="Shelter">{row.hasShelter ? "Has shelter facility" : "Field rescue only"}</DetailRow>}
        {row.user && <DetailRow label="Account">{row.user.fullName} · {row.user.email}</DetailRow>}
        <DetailRow label="Location"><MapLink lat={row.latitude} lng={row.longitude} /></DetailRow>
      </dl>
      {session.role === "ADMIN" && (
        <Section title="Verification decision">
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs text-muted">{kind === "clinics" ? "Only verified clinics can record and verify vaccinations." : "Only verified organisations can record CNVR activity."}</p>
            <Field label="Note to the account holder">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" maxLength={500} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => void decide("SUSPENDED")} loading={busy === "SUSPENDED"} disabled={!!busy || row.verificationStatus === "SUSPENDED"}><Ban /> Suspend</Button>
              <Button size="sm" variant="danger" onClick={() => void decide("REJECTED")} loading={busy === "REJECTED"} disabled={!!busy || row.verificationStatus === "REJECTED"}><XCircle /> Reject</Button>
              <Button size="sm" variant="success" onClick={() => void decide("VERIFIED")} loading={busy === "VERIFIED"} disabled={!!busy || row.verificationStatus === "VERIFIED"}><BadgeCheck /> Verify</Button>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ users

export type UserRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  municipality: string | null;
  wardNumber: number | null;
  isActive: boolean;
  createdAt: string;
  veterinaryClinic: { clinicName: string; verificationStatus: string } | null;
  rescueOrganization: { organizationName: string; verificationStatus: string } | null;
  _count: { pets: number; incidentsReported: number };
};

export const userColumns: ColumnDef<UserRow, unknown>[] = [
  { accessorKey: "fullName", header: "User", enableSorting: true, enableHiding: false, cell: ({ row }) => <TitleCell title={row.original.fullName} subtitle={row.original.email} name={row.original.fullName} />, meta: { label: "Name" } },
  { accessorKey: "role", header: "Role", enableSorting: true, cell: ({ row }) => <span className="text-fg-soft">{ROLE_LABEL[row.original.role]}</span>, meta: { label: "Role" } },
  { id: "org", header: "Organisation", cell: ({ row }) => <span className="text-xs text-muted">{row.original.veterinaryClinic?.clinicName ?? row.original.rescueOrganization?.organizationName ?? "—"}</span>, meta: { label: "Organisation", exportValue: (r) => r.veterinaryClinic?.clinicName ?? r.rescueOrganization?.organizationName ?? "" } },
  { accessorKey: "municipality", header: "Area", enableSorting: true, cell: ({ row }) => <span className="text-xs text-muted">{row.original.wardNumber ? `Ward ${row.original.wardNumber}, ` : ""}{short(row.original.municipality) || "—"}</span>, meta: { label: "Area" } },
  { id: "activity", header: "Pets / reports", cell: ({ row }) => <span className="tabular-nums text-muted">{row.original._count.pets} / {row.original._count.incidentsReported}</span>, meta: { label: "Pets / reports", exportValue: (r) => `${r._count.pets}/${r._count.incidentsReported}` } },
  { accessorKey: "isActive", header: "Active", cell: ({ row }) => <YesNo value={row.original.isActive} yes="Active" no="Deactivated" />, meta: { label: "Active" } },
  { accessorKey: "createdAt", header: "Joined", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.createdAt} />, meta: { label: "Joined" } },
];

export const userFacets: Facet[] = [
  { key: "role", label: "Role", options: (Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] })) },
  { key: "isActive", label: "Active", single: true, options: [{ value: "true", label: "Active" }, { value: "false", label: "Deactivated" }] },
];

export function UserInspector({ row, refresh, close }: InspectorProps<UserRow>) {
  const session = useSession();
  const [role, setRole] = useState<Role>(row.role);
  const [municipality, setMunicipality] = useState(row.municipality ?? "");
  const [busy, setBusy] = useState(false);
  const self = row.id === session.id;
  const save = async (extra?: { isActive: boolean }) => {
    setBusy(true);
    try {
      await api(`/users/${row.id}`, { method: "PUT", body: { role, municipality: municipality || null, ...extra } });
      toast.success("User updated");
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
        <DetailRow label="Email">{row.email}</DetailRow>
        <DetailRow label="Phone">{row.phone}</DetailRow>
        <DetailRow label="Joined">{formatDateTime(row.createdAt)}</DetailRow>
        <DetailRow label="Status"><YesNo value={row.isActive} yes="Active" no="Deactivated" /></DetailRow>
      </dl>
      <Section title="Access">
        <div className="space-y-3 rounded-lg border border-border p-3">
          <Field label="Role" hint={self ? "You cannot change your own role." : "Changing role signs the user out of all sessions."}>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={self}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <Field label="Municipality" hint="Ward officers only see incidents in their municipality.">
            <MunicipalityInput value={municipality} onChange={(e) => setMunicipality(e.target.value)} placeholder="Leave empty for all municipalities" />
          </Field>
          <div className="flex justify-between gap-2">
            {!self && (
              <Button size="sm" variant={row.isActive ? "danger" : "success"} onClick={() => void save({ isActive: !row.isActive })} disabled={busy}>
                {row.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            )}
            <Button size="sm" variant="primary" className="ml-auto" onClick={() => void save()} loading={busy}>Save changes</Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ audit

export type AuditRow = { id: string; action: string; entityType: string; entityId: string; before: unknown; after: unknown; createdAt: string; actor: { id: string; fullName: string; role: string } | null };

export const auditColumns: ColumnDef<AuditRow, unknown>[] = [
  { accessorKey: "createdAt", header: "When", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.createdAt} relative />, meta: { label: "When" } },
  { accessorKey: "action", header: "Action", enableSorting: true, cell: ({ row }) => <span className="font-mono text-xs text-fg">{row.original.action}</span>, meta: { label: "Action" } },
  { accessorKey: "entityType", header: "Entity", enableSorting: true, cell: ({ row }) => <span className="text-fg-soft">{titleCase(row.original.entityType.replace(/([a-z])([A-Z])/g, "$1 $2"))}</span>, meta: { label: "Entity" } },
  { accessorKey: "entityId", header: "Record", cell: ({ row }) => <span className="font-mono text-xs text-muted">{row.original.entityId.slice(-10)}</span>, meta: { label: "Record" } },
  { id: "actor", header: "Actor", cell: ({ row }) => (row.original.actor ? <span className="text-fg-soft">{row.original.actor.fullName}</span> : <span className="text-muted">Guest / system</span>), meta: { label: "Actor", exportValue: (r) => r.actor?.fullName ?? "" } },
];

export const auditFacets: Facet[] = [
  { key: "entityType", label: "Entity", single: true, options: ["BiteIncident", "VaccinationRecord", "CnvrRecord", "CommunityStray", "Pet", "VeterinaryClinic", "RescueOrganization", "User", "Report"].map((e) => ({ value: e, label: e.replace(/([a-z])([A-Z])/g, "$1 $2") })) },
];

export function AuditInspector({ row }: InspectorProps<AuditRow>) {
  const block = (v: unknown) => <pre className="scroll-thin max-h-64 overflow-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs text-fg-soft">{v === null || v === undefined ? "—" : JSON.stringify(v, null, 2)}</pre>;
  return (
    <div className="space-y-5">
      <dl className="divide-y divide-border">
        <DetailRow label="When">{formatDateTime(row.createdAt)}</DetailRow>
        <DetailRow label="Actor">{row.actor ? `${row.actor.fullName} (${titleCase(row.actor.role)})` : "Guest / system"}</DetailRow>
        <DetailRow label="Entity">{row.entityType} · <span className="font-mono text-xs">{row.entityId}</span></DetailRow>
      </dl>
      <Section title="Before">{block(row.before)}</Section>
      <Section title="After">{block(row.after)}</Section>
    </div>
  );
}

// Stable per-kind inspectors (defined once so DataTable never remounts them).
export function ClinicInspector(p: InspectorProps<DirectoryRow>) {
  return <DirectoryInspector {...p} kind="clinics" />;
}
export function OrganizationInspector(p: InspectorProps<DirectoryRow>) {
  return <DirectoryInspector {...p} kind="organizations" />;
}
