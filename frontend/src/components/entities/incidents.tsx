"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Eye, Hand, ShieldCheck, Undo2, UserCheck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { runEach, type BulkAction, type Facet, type InspectorProps } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/button";
import { DetailRow, Field, Select, Skeleton, Textarea } from "@/components/ui/primitives";
import { DualDate } from "@/components/ui/dual-date";
import { StatusPill } from "@/components/ui/status-pill";
import { api, errorMessage } from "@/lib/api";
import { can, useSession, type ClientSession } from "@/lib/client/session";
import { ANIMAL_TYPES, INCIDENT_STATUSES, INCIDENT_TRANSITIONS, options, SEVERITIES, type IncidentStatus } from "@/lib/constants";
import { formatDateTime, titleCase } from "@/lib/utils";
import { CopyButton, DateCell, ExternalMapLink, IdCell, MapLink, Section, Timeline } from "./common";

export type IncidentRow = {
  id: string;
  animalType: string;
  severity: string;
  description: string;
  incidentDate: string;
  suspectedRabies: boolean;
  latitude: number;
  longitude: number;
  locationAccuracyM: number | null;
  address: string | null;
  wardNumber: number | null;
  municipality: string | null;
  status: IncidentStatus;
  statusNote: string | null;
  photoUrl: string | null;
  reporterName: string | null;
  reporterPhone: string | null;
  reportedBy?: { id: string; fullName: string; phone: string | null } | null;
  handledById?: string | null;
  handledBy?: Handler | null;
  createdAt: string;
  updatedAt: string;
};

type IncidentDetail = IncidentRow & { history: { id: string; action: string; after: string | null; createdAt: string; actor: { fullName: string; role: string } | null }[] };
export type Handler = { id: string; fullName: string; role: string; rescueOrganization?: { id: string; organizationName: string; phone: string } | null };
type Officer = { id: string; fullName: string; municipality: string | null; wardNumber: number | null; openCases: number; sameWard: boolean };
type Org = { id: string; organizationName: string; municipality: string | null; hasShelter: boolean; distanceKm: number; withinServiceArea: boolean; openCases: number };
/** Rescue orgs are shown by organisation name, officers by their own name. */
export const handlerName = (h: Handler | null | undefined) => (h ? (h.rescueOrganization?.organizationName ?? h.fullName) : null);
const handlerKind = (h: Handler) => (h.role === "RESCUE_ORG" ? "Rescue organisation" : h.role === "WARD_OFFICER" ? "Ward officer" : "Administrator");

const short = (m: string | null) => m?.replace(" Metropolitan City", "").replace(" Municipality", "") ?? "";

export const incidentColumns: ColumnDef<IncidentRow, unknown>[] = [
  { id: "id", header: "Code", cell: ({ row }) => <IdCell id={row.original.id} />, meta: { label: "Code", exportValue: (r) => r.id } },
  { accessorKey: "incidentDate", header: "Date", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.incidentDate} />, meta: { label: "Date" } },
  {
    id: "incident",
    header: "Incident",
    cell: ({ row }) => (
      <div className="min-w-56 max-w-md">
        <p className="font-medium text-fg">{titleCase(row.original.animalType)} bite</p>
        <p className="line-clamp-1 text-xs text-muted">{row.original.description}</p>
      </div>
    ),
    meta: { label: "Incident", exportValue: (r) => `${r.animalType}: ${r.description}` },
  },
  { accessorKey: "severity", header: "Severity", enableSorting: true, cell: ({ row }) => <StatusPill status={row.original.severity} />, meta: { label: "Severity" } },
  {
    accessorKey: "suspectedRabies",
    header: "Rabies?",
    cell: ({ row }) => (row.original.suspectedRabies ? <StatusPill status="HIGH" label="Suspected" live={!["RESOLVED", "DISMISSED"].includes(row.original.status)} /> : <span className="text-xs text-muted">No</span>),
    meta: { label: "Suspected rabies", exportValue: (r) => (r.suspectedRabies ? "Yes" : "No") },
  },
  { accessorKey: "status", header: "Status", enableSorting: true, cell: ({ row }) => <StatusPill status={row.original.status} />, meta: { label: "Status" } },
  {
    id: "location",
    header: "Location",
    cell: ({ row }) => (
      <div className="min-w-40 whitespace-nowrap">
        <p className="truncate text-fg-soft">{row.original.address ?? "—"}</p>
        <p className="text-xs text-muted">{row.original.wardNumber ? `Ward ${row.original.wardNumber}, ` : ""}{short(row.original.municipality)}</p>
      </div>
    ),
    meta: { label: "Location", exportValue: (r) => [r.address, r.wardNumber ? `Ward ${r.wardNumber}` : null, r.municipality].filter(Boolean).join(", ") },
  },
  { accessorKey: "wardNumber", header: "Ward", enableSorting: true, cell: ({ row }) => row.original.wardNumber ?? "—", meta: { label: "Ward" } },
  {
    id: "reporter",
    header: "Reporter",
    cell: ({ row }) => {
      const r = row.original;
      const name = r.reportedBy?.fullName ?? r.reporterName;
      return name ? (
        <div className="min-w-40 whitespace-nowrap">
          <p className="text-fg-soft">{name}</p>
          <p className="text-xs text-muted">{r.reportedBy ? "Registered" : "Guest"}{(r.reportedBy?.phone ?? r.reporterPhone) ? ` · ${r.reportedBy?.phone ?? r.reporterPhone}` : ""}</p>
        </div>
      ) : (
        <span className="text-xs text-muted">Hidden</span>
      );
    },
    meta: { label: "Reporter", exportValue: (r) => r.reportedBy?.fullName ?? r.reporterName ?? "" },
  },
  {
    id: "handledBy",
    header: "Handled by",
    cell: ({ row }) => {
      const h = row.original.handledBy;
      return h ? (
        <span className="text-xs">
          <span className="text-fg">{handlerName(h)}</span>
          <span className="block text-muted">{handlerKind(h)}</span>
        </span>
      ) : (
        <StatusPill status="REPORTED" label="Unassigned" />
      );
    },
    meta: { label: "Handled by", exportValue: (r) => handlerName(r.handledBy) ?? "" },
  },
  { accessorKey: "createdAt", header: "Submitted", enableSorting: true, cell: ({ row }) => <DateCell value={row.original.createdAt} relative />, meta: { label: "Submitted" } },
];

export const incidentFacets: Facet[] = [
  { key: "status", label: "Status", options: options(INCIDENT_STATUSES) },
  { key: "severity", label: "Severity", options: options(SEVERITIES) },
  { key: "animalType", label: "Animal", options: options(ANIMAL_TYPES) },
  { key: "suspectedRabies", label: "Suspected rabies", single: true, options: [{ value: "true", label: "Suspected" }, { value: "false", label: "Not suspected" }] },
];

/** Officers, admin & rescue orgs: "Assigned to me" / "Unassigned" work queues (?assigned=me|none). */
export const incidentAssignedFacet: Facet = { key: "assigned", label: "Assignment", single: true, options: [{ value: "me", label: "Assigned to me" }, { value: "none", label: "Unassigned" }] };

export function incidentBulkActions(session: ClientSession): BulkAction<IncidentRow>[] {
  if (!can(session, "WARD_OFFICER")) return [];
  const move = (to: IncidentStatus, label: string, icon: BulkAction<IncidentRow>["icon"], variant?: BulkAction<IncidentRow>["variant"]): BulkAction<IncidentRow> => ({
    id: to,
    label,
    icon,
    variant,
    run: (rows) => {
      const eligible = rows.filter((r) => INCIDENT_TRANSITIONS[r.status].includes(to));
      if (!eligible.length) throw new Error(`None of the selected incidents can move to ${titleCase(to)}`);
      return runEach(eligible, (r) => api(`/incidents/${r.id}/status`, { method: "PATCH", body: { status: to, note: "Bulk update from incidents table" } }), `Moved to ${titleCase(to)}:`).then(
        (m) => (eligible.length < rows.length ? `${m} · ${rows.length - eligible.length} not eligible` : m),
      );
    },
  });
  return [
    move("UNDER_REVIEW", "Review", Eye),
    move("VERIFIED", "Verify", ShieldCheck, "success"),
    move("RESOLVED", "Resolve", CheckCircle2),
    move("DISMISSED", "Dismiss", XCircle, "danger"),
  ];
}

export function IncidentInspector({ row, refresh }: InspectorProps<IncidentRow>) {
  const session = useSession();
  const { data, mutate } = useSWR<IncidentDetail>(`/incidents/${row.id}`);
  const r = data ?? row;
  const [next, setNext] = useState<IncidentStatus | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const officer = can(session, "WARD_OFFICER");
  const rescue = session.role === "RESCUE_ORG";
  const mineCase = !!r.handledBy && r.handledBy.id === session.id;
  const canUpdate = officer || (rescue && mineCase);
  const allowed = INCIDENT_TRANSITIONS[r.status];

  const save = async () => {
    if (!next) return;
    setSaving(true);
    try {
      await api(`/incidents/${r.id}/status`, { method: "PATCH", body: { status: next, note: note || undefined } });
      toast.success(`Incident moved to ${titleCase(next)}`);
      setNext("");
      setNote("");
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
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={r.status} />
        <StatusPill status={r.severity} label={`${titleCase(r.severity)} severity`} />
        {r.suspectedRabies && <StatusPill status="HIGH" label="Suspected rabies" live />}
        <span className="ml-auto"><CopyButton value={r.id} label="Tracking code" /></span>
      </div>

      <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm leading-relaxed text-fg-soft">{r.description}</p>

      {r.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.photoUrl} alt="Incident evidence" className="max-h-64 w-full rounded-lg border border-border object-cover" />
      )}

      <Section title="Details">
        <dl className="divide-y divide-border">
          <DetailRow label="Animal">{titleCase(r.animalType)}</DetailRow>
          <DetailRow label="Occurred"><DualDate value={r.incidentDate} time stacked /></DetailRow>
          <DetailRow label="Submitted"><DualDate value={r.createdAt} time stacked /></DetailRow>
          <DetailRow label="Location">
            <div className="space-y-1">
              <p>{[r.address, r.wardNumber ? `Ward ${r.wardNumber}` : null, r.municipality].filter(Boolean).join(", ") || "—"}</p>
              <p className="font-mono text-xs text-muted">{r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}{r.locationAccuracyM ? ` · ±${Math.round(r.locationAccuracyM)} m` : ""}</p>
              <div className="flex gap-3"><MapLink lat={r.latitude} lng={r.longitude} /><ExternalMapLink lat={r.latitude} lng={r.longitude} /></div>
            </div>
          </DetailRow>
          <DetailRow label="Reporter">
            {r.reportedBy?.fullName ?? r.reporterName ?? <span className="text-muted">Redacted for your role</span>}
            {(r.reportedBy?.phone ?? r.reporterPhone) && <a className="ml-2 text-accent" href={`tel:${r.reportedBy?.phone ?? r.reporterPhone}`}>{r.reportedBy?.phone ?? r.reporterPhone}</a>}
          </DetailRow>
          <DetailRow label="Handled by">
            {r.handledBy ? (
              <>
                {handlerName(r.handledBy)} <span className="text-xs text-muted">· {handlerKind(r.handledBy)}</span>
              </>
            ) : (
              <span className="text-muted">Not yet taken</span>
            )}
          </DetailRow>
          {r.statusNote && <DetailRow label="Latest note">{r.statusNote}</DetailRow>}
        </dl>
      </Section>

      {(officer || rescue) && (
        <AssignmentPanel
          incident={r}
          onSaved={() => {
            void mutate();
            refresh();
          }}
        />
      )}

      {canUpdate && (
        <Section title="Update status">
          <div className="space-y-3 rounded-lg border border-border p-3">
            <Field label="Move to" hint={`Allowed from ${titleCase(r.status)}: ${allowed.map(titleCase).join(", ")}`}>
              <Select value={next} onChange={(e) => setNext(e.target.value as IncidentStatus)}>
                <option value="">Choose next status…</option>
                {allowed.map((s) => (
                  <option key={s} value={s}>{titleCase(s)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Note (shared with the reporter)">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Field team visited; dog vaccinated by CNVR team" className="min-h-20" maxLength={1000} />
            </Field>
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={() => void save()} disabled={!next} loading={saving}>Save status</Button>
            </div>
          </div>
        </Section>
      )}

      {(officer || mineCase) && (
        <Section title="Activity">
          {!data ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <Timeline
              items={data.history.map((h) => {
                let after: { status?: string; note?: string; handledBy?: string | null } = {};
                try {
                  after = h.after ? (JSON.parse(h.after) as typeof after) : {};
                } catch {
                  /* ignore */
                }
                return {
                  key: h.id,
                  title:
                    h.action === "INCIDENT_CREATED"
                      ? "Report submitted"
                      : h.action === "INCIDENT_STATUS_CHANGED"
                        ? `Status → ${titleCase(after.status ?? "")}`
                        : h.action === "INCIDENT_ASSIGNED"
                          ? after.handledBy
                            ? `Assigned to ${after.handledBy}`
                            : "Unassigned"
                          : h.action === "INCIDENT_CLAIMED"
                            ? `Taken by ${after.handledBy ?? "a handler"}`
                            : h.action === "INCIDENT_RELEASED"
                              ? "Released back to the queue"
                              : titleCase(h.action),
                  meta: `${formatDateTime(h.createdAt)} · ${h.actor?.fullName ?? "Guest reporter"}`,
                  body: after.note,
                  tone: after.status === "RESOLVED" || after.status === "VERIFIED" ? "success" : after.status === "DISMISSED" ? "danger" : "default",
                };
              })}
            />
          )}
        </Section>
      )}
    </div>
  );
}

/**
 * Who owns the case. One handler at a time: a ward officer or a verified rescue organisation.
 * - anyone eligible can "Take this case" while it is unassigned (first come, first served)
 * - admin / ward officers can assign or reassign
 * - the handler can release it back to the queue
 */
function AssignmentPanel({ incident, onSaved }: { incident: IncidentRow; onSaved: () => void }) {
  const session = useSession();
  const manager = can(session, "WARD_OFFICER");
  const { data } = useSWR<{ officers: Officer[]; organizations: Org[] }>(manager ? `/incidents/${incident.id}/assignees` : null);
  const current = incident.handledBy?.id ?? "";
  const [pick, setPick] = useState(current);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    setPick(current);
  }, [current]);
  const closed = incident.status === "RESOLVED" || incident.status === "DISMISSED";
  const mine = current === session.id;
  const canTake = !current && !closed && (session.role === "WARD_OFFICER" || (session.role === "RESCUE_ORG" && session.organizationStatus === "VERIFIED"));
  const officers = (data?.officers ?? []).slice().sort((a, b) => Number(b.sameWard) - Number(a.sameWard) || a.openCases - b.openCases);
  const orgs = data?.organizations ?? [];
  const nameOf = (id: string) => officers.find((o) => o.id === id)?.fullName ?? orgs.find((o) => o.id === id)?.organizationName;

  const run = async (key: string, req: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await req();
      toast.success(done);
      setNote("");
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
      onSaved(); // someone may have taken it meanwhile: show the current owner
    } finally {
      setBusy(null);
    }
  };
  const take = () => run("take", () => api(`/incidents/${incident.id}/claim`, { method: "POST", body: {} }), "You're now handling this case. Admin and the ward office have been notified");
  const release = () => run("release", () => api(`/incidents/${incident.id}/release`, { method: "POST", body: { note: note || undefined } }), "Case released back to the queue");
  const assign = (id: string | null) =>
    run("assign", () => api(`/incidents/${incident.id}/assign`, { method: "PATCH", body: { handledById: id, note: note || undefined } }), id ? `Assigned to ${id === session.id ? "you" : (nameOf(id) ?? "handler")}` : "Assignment removed");

  return (
    <Section title="Who is handling this?">
      <div className="space-y-3 rounded-lg border border-border p-3">
        {incident.handledBy ? (
          <div className="flex items-center gap-3">
            <UserCheck className="size-5 shrink-0 text-success" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-fg">{mine ? "You are handling this case" : handlerName(incident.handledBy)}</p>
              <p className="text-xs text-muted">
                {handlerKind(incident.handledBy)}
                {incident.handledBy.rescueOrganization?.phone && !mine ? <> · <a className="text-accent" href={`tel:${incident.handledBy.rescueOrganization.phone}`}>{incident.handledBy.rescueOrganization.phone}</a></> : null}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-fg-soft">
            Nobody has taken this report yet.{" "}
            {canTake ? "If your team is nearby, take it and follow up." : manager ? "Assign it below, or wait for a nearby team to take it." : ""}
          </p>
        )}

        {session.role === "RESCUE_ORG" && session.organizationStatus !== "VERIFIED" && !current && (
          <p className="text-xs text-warning">Your organisation must be verified by an administrator before it can take cases.</p>
        )}
        {session.role === "ADMIN" && <p className="text-[11px] text-muted">Your own status changes are recorded under your name but don't make you the handler.</p>}

        {(canTake || mine) && (
          <div className="flex flex-wrap gap-2">
            {canTake && (
              <Button size="sm" variant="primary" onClick={() => void take()} loading={busy === "take"} disabled={!!busy}>
                <Hand /> Take this case
              </Button>
            )}
            {mine && !closed && (
              <Button size="sm" variant="ghost" onClick={() => void release()} loading={busy === "release"} disabled={!!busy}>
                <Undo2 /> Release case
              </Button>
            )}
          </div>
        )}

        {manager && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-fg">{current ? "Reassign" : "Assign to"}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1" aria-label="Choose handler" disabled={!data}>
                <option value="">{data ? "Choose an officer or rescue organisation…" : "Loading…"}</option>
                <optgroup label={`Ward officers${incident.municipality ? ` · ${incident.municipality}` : ""}`}>
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.fullName}
                      {o.id === session.id ? " (you)" : ""} · {o.wardNumber ? `Ward ${o.wardNumber}` : "All wards"} · {o.openCases} open{o.sameWard ? " · same ward" : ""}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Rescue organisations · nearest first">
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.organizationName} · {o.distanceKm} km{o.withinServiceArea ? "" : " (outside service area)"} · {o.openCases} open
                    </option>
                  ))}
                </optgroup>
              </Select>
              <Button size="sm" variant="secondary" className="h-9" onClick={() => void assign(pick)} loading={busy === "assign"} disabled={!pick || pick === current || !!busy}>
                <UserCheck /> {current ? "Reassign" : "Assign"}
              </Button>
            </div>
            {pick !== "" && pick !== current && (
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the handler (optional), e.g. please visit the site today" className="min-h-14" maxLength={500} />
            )}
            {current && !mine && (
              <Button size="sm" variant="ghost" onClick={() => void assign(null)} disabled={!!busy}>
                Remove handler
              </Button>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
