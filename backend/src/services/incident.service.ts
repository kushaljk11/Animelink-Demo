// Bite / suspected-rabies incidents and their review workflow (Sections H.11, K.4, N.4).
import { AnimalType, IncidentStatus, Severity, type Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../config/db";
import { badRequest, boolParam, conflict, dateRange, enumFilter, forbidden, intParam, notFound, paginated, type ListParams } from "../utils/http";
import { INCIDENT_TRANSITIONS, type incidentCreateSchema, type incidentUpdateSchema } from "../validators";
import { hasRole, type SessionUser } from "./auth.service";
import { haversineKm } from "./geo";
import { monitoringUsers, raiseIncidentAlerts } from "./incidents";
import { notify } from "./notify";
import { sms } from "./notification.service";
import { trackByCode, withTrackingCode } from "./public.service";
import { frontendOrigin } from "../utils/http";
import { incidentScope, redactIncident } from "./rbac";
import { deleteUpload } from "./uploads";

const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });
const STATUS_LABEL: Record<IncidentStatus, string> = {
  REPORTED: "received",
  UNDER_REVIEW: "under review",
  VERIFIED: "verified",
  RESOLVED: "resolved",
  DISMISSED: "closed without action",
};

export async function listIncidents(user: SessionUser, p: ListParams) {
  const statuses = enumFilter(p.status, IncidentStatus);
  const severities = enumFilter(p.sp.get("severity")?.split(","), Severity, "severity");
  const animals = enumFilter(p.sp.get("animalType")?.split(","), AnimalType, "animalType");
  const suspected = boolParam(p.sp, "suspectedRabies");
  const ward = intParam(p.sp, "wardNumber");
  const municipality = p.sp.get("municipality");
  const mine = boolParam(p.sp, "mine");
  const assigned = p.sp.get("assigned"); // "me" | "none"
  const where: Prisma.BiteIncidentWhereInput = {
    AND: [
      incidentScope(user),
      statuses ? { status: { in: statuses } } : {},
      severities ? { severity: { in: severities } } : {},
      animals ? { animalType: { in: animals } } : {},
      suspected !== undefined ? { suspectedRabies: suspected } : {},
      municipality ? { municipality } : {},
      ward ? { wardNumber: ward } : {},
      mine ? { reportedById: user.id } : {},
      assigned === "me" ? { handledById: user.id } : assigned === "none" ? { handledById: null } : {},
      dateRange("incidentDate", p.from, p.to),
      p.query ? { OR: [{ description: ci(p.query) }, { address: ci(p.query) }, { id: p.query }] } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.biteIncident.findMany({
      where,
      orderBy: p.orderBy,
      skip: p.skip,
      take: p.take,
      include: incidentInclude,
    }),
    prisma.biteIncident.count({ where }),
  ]);
  return paginated(rows.map((r) => redactIncident(user, r)), total, p);
}

/** Anyone may report (K.5). Guests must leave a phone; signed-in users are linked automatically. */
export async function createIncident(user: SessionUser | null, body: z.output<typeof incidentCreateSchema>) {
  if (!user && !body.reporterPhone) throw badRequest("Please leave a phone number so ward officers can follow up on your report");
  const incident = await withTrackingCode((trackingCode) =>
    prisma.biteIncident.create({
      data: {
        ...body,
        trackingCode,
        reportedById: user?.id ?? null,
        reporterName: user ? null : (body.reporterName ?? null),
        reporterPhone: user ? null : (body.reporterPhone ?? null),
        status: "REPORTED",
      },
    }),
  );
  await raiseIncidentAlerts(incident);
  // Guests have no inbox: their tracking code (and first-aid advice) goes out by SMS.
  const to = incident.reporterPhone ?? user?.phone;
  if (to) {
    const firstAid = incident.severity !== "LOW" || incident.suspectedRabies ? " If bitten: wash 15 min with soap & water, go to hospital today." : "";
    await sms(to, "incident.created", `report ${incident.trackingCode} received.${firstAid} Track: ${frontendOrigin()}/track?q=${incident.trackingCode}`);
  }
  return incident;
}

/** Who owns a case: a ward officer, or a rescue organisation (shown by its organisation name). */
const handlerSelect = { id: true, fullName: true, role: true, rescueOrganization: { select: { id: true, organizationName: true, phone: true } } } as const;
const incidentInclude = { reportedBy: { select: { id: true, fullName: true, phone: true } }, handledBy: { select: handlerSelect } } as const;
type Handler = { fullName: string; role: string; rescueOrganization: { organizationName: string } | null };
const handlerName = (h: Handler) => h.rescueOrganization?.organizationName ?? h.fullName;
const OPEN: IncidentStatus[] = ["REPORTED", "UNDER_REVIEW", "VERIFIED"];

async function load(user: SessionUser, id: string) {
  const incident = await prisma.biteIncident.findFirst({
    where: { AND: [{ id }, incidentScope(user)] },
    include: incidentInclude,
  });
  if (!incident) throw notFound("Incident");
  return incident;
}

export async function getIncident(user: SessionUser, id: string) {
  const incident = await load(user, id);
  const history = hasRole(user, "WARD_OFFICER") || incident.handledById === user.id
    ? await prisma.auditLog.findMany({
        where: { entityType: "BiteIncident", entityId: incident.id },
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { fullName: true, role: true } } },
      })
    : [];
  return { ...redactIncident(user, incident), history };
}

/** Reporters may correct their report until review starts; ward officers any time. */
export async function updateIncident(user: SessionUser, id: string, body: z.output<typeof incidentUpdateSchema>) {
  const incident = await load(user, id);
  if (!hasRole(user, "WARD_OFFICER")) {
    if (incident.reportedById !== user.id) throw forbidden("You can only edit your own reports");
    if (incident.status !== "REPORTED") throw conflict("This report is already being reviewed and can no longer be edited");
  }
  const updated = await prisma.biteIncident.update({ where: { id }, data: body });
  if (body.photoUrl !== undefined && incident.photoUrl && body.photoUrl !== incident.photoUrl) await deleteUpload(incident.photoUrl);
  return { before: incident, updated: redactIncident(user, updated) };
}

/** Official records: admin may delete; a reporter may withdraw an untouched report. */
export async function deleteIncident(user: SessionUser, id: string) {
  const incident = await load(user, id);
  if (user.role !== "ADMIN" && !(incident.reportedById === user.id && incident.status === "REPORTED")) {
    throw forbidden("Incident records can only be withdrawn by the reporter before review");
  }
  await prisma.biteIncident.delete({ where: { id } });
  await deleteUpload(incident.photoUrl);
  return incident;
}

/** State machine: REPORTED → UNDER_REVIEW → VERIFIED → RESOLVED (or DISMISSED). Illegal moves → 409. */
export async function transitionIncident(user: SessionUser, id: string, status: IncidentStatus, note?: string | null) {
  const incident = await prisma.biteIncident.findFirst({ where: { AND: [{ id }, incidentScope(user)] } });
  if (!incident) throw notFound("Incident");
  if (user.role === "RESCUE_ORG" && incident.handledById !== user.id) throw forbidden("Take this case first. Only the team handling a report can update its status");
  if (incident.status === status) throw conflict(`Incident is already ${status}`);
  const allowed = INCIDENT_TRANSITIONS[incident.status];
  if (!allowed.includes(status)) throw conflict(`Cannot move an incident from ${incident.status} to ${status}. Allowed: ${allowed.join(", ")}`);
  // The assigned officer owns the case. An officer acting on an unassigned report claims it;
  // an admin acting as supervisor never takes ownership (the audit log still records who acted).
  const claim = !incident.handledById && user.role === "WARD_OFFICER";
  const updated = await prisma.biteIncident.update({ where: { id }, data: { status, statusNote: note ?? null, ...(claim ? { handledById: user.id } : {}) } });
  if (incident.reporterPhone) {
    await sms(incident.reporterPhone, "incident.status", `report ${incident.trackingCode} is now ${STATUS_LABEL[status]}.${note ? ` ${note.slice(0, 90)}` : ""}`);
  }
  if (incident.reportedById) {
    await notify({
      userId: incident.reportedById,
      type: "INCIDENT_UPDATE",
      title: `Your incident report is ${STATUS_LABEL[status]}`,
      message: note ? `Update from ${updater(user)}: ${note}` : `${updater(user)} marked your report from ${incident.incidentDate.toISOString().slice(0, 10)} as ${STATUS_LABEL[status]}.`,
      link: `/app/incidents/${incident.id}`,
    });
  }
  return { before: incident, updated };
}

// ------------------------------------------------------------ assignment
// A case is owned by ONE handler: a ward officer or a verified rescue organisation.
//  - admin / ward officers assign or reassign anyone eligible
//  - ward officers and verified rescue orgs can "take" an unassigned case themselves
//  - the handler can release it; admin always sees who owns what (and the audit trail)

const updater = (u: SessionUser) => (u.role === "RESCUE_ORG" ? "The rescue team" : u.role === "ADMIN" ? "The administrator" : "The ward office");

async function openCaseCounts(userIds: string[]) {
  const loads = await prisma.biteIncident.groupBy({ by: ["handledById"], where: { handledById: { in: userIds }, status: { in: OPEN } }, _count: { _all: true } });
  return new Map(loads.map((l) => [l.handledById, l._count._all]));
}

/** Eligible handlers: officers covering the municipality, and verified rescue orgs sorted by distance. */
export async function listAssignees(user: SessionUser, id: string) {
  const incident = await load(user, id);
  const [officers, orgs] = await Promise.all([
    prisma.user.findMany({
      where: { role: "WARD_OFFICER", isActive: true, ...(incident.municipality ? { OR: [{ municipality: incident.municipality }, { municipality: null }] } : {}) },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, municipality: true, wardNumber: true },
    }),
    prisma.rescueOrganization.findMany({
      where: { verificationStatus: "VERIFIED", user: { isActive: true } },
      select: { userId: true, organizationName: true, municipality: true, latitude: true, longitude: true, serviceRadiusKm: true, hasShelter: true },
    }),
  ]);
  const open = await openCaseCounts([...officers.map((o) => o.id), ...orgs.map((o) => o.userId)]);
  const here = { lat: incident.latitude, lng: incident.longitude };
  return {
    officers: officers.map((o) => ({ ...o, openCases: open.get(o.id) ?? 0, sameWard: !!incident.wardNumber && o.wardNumber === incident.wardNumber })),
    organizations: orgs
      .map((o) => {
        const distanceKm = Math.round(haversineKm(here, { lat: o.latitude, lng: o.longitude }) * 10) / 10;
        return { id: o.userId, organizationName: o.organizationName, municipality: o.municipality, hasShelter: o.hasShelter, distanceKm, withinServiceArea: distanceKm <= o.serviceRadiusKm, openCases: open.get(o.userId) ?? 0 };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm),
  };
}

/** Validates that a user may own this incident; returns them with a display name. */
async function eligibleHandler(incident: { municipality: string | null }, userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { ...handlerSelect, isActive: true, municipality: true, rescueOrganization: { select: { id: true, organizationName: true, phone: true, verificationStatus: true } } } });
  if (!target || !target.isActive) throw badRequest("That account is not active");
  if (target.role === "WARD_OFFICER") {
    if (incident.municipality && target.municipality && target.municipality !== incident.municipality) {
      throw badRequest(`${target.fullName} covers ${target.municipality}, but this incident is in ${incident.municipality}`);
    }
  } else if (target.role === "RESCUE_ORG") {
    if (target.rescueOrganization?.verificationStatus !== "VERIFIED") throw badRequest("Only verified rescue organisations can handle incidents");
  } else {
    throw badRequest("Incidents can be handled only by a ward officer or a verified rescue organisation");
  }
  return target;
}

/** Tell the reporter, the new handler and the monitoring team who owns the case now. */
async function announceHandler(incident: { id: string; reportedById: string | null; municipality: string | null; animalType: string; address: string | null }, handler: Handler & { id: string }, actor: SessionUser, note?: string | null) {
  const name = handlerName(handler);
  const what = `${incident.animalType.toLowerCase()} bite report${incident.address ? ` at ${incident.address}` : ""}`;
  const link = `/app/incidents/${incident.id}`;
  if (handler.id !== actor.id) {
    await notify({ userId: handler.id, type: "INCIDENT_UPDATE", title: "Incident assigned to you", message: `${actor.fullName} assigned you a ${what}${note ? `: ${note}` : "."}`, link });
  }
  if (incident.reportedById && incident.reportedById !== actor.id) {
    await notify({
      userId: incident.reportedById,
      type: "INCIDENT_UPDATE",
      title: "Someone is handling your report",
      message: handler.role === "RESCUE_ORG" ? `${name} (rescue organisation) has taken your report and will follow up.` : `Ward officer ${name} is now handling your report.`,
      link,
    });
  }
  if (handler.id === actor.id) {
    // Self-claimed: keep admin and the area's officers in the loop.
    for (const m of await monitoringUsers(incident.municipality)) {
      if (m.id === actor.id) continue;
      await notify({ userId: m.id, type: "INCIDENT_UPDATE", title: `${name} took a case`, message: `${name} is now handling the ${what}.`, link, dedupeKey: `incident:${incident.id}:claim:${handler.id}:${m.id}` });
    }
  }
}

export async function assignIncident(user: SessionUser, id: string, handledById: string | null, note?: string | null) {
  const incident = await load(user, id);
  if (incident.handledById === handledById) throw conflict(handledById ? "This handler is already assigned" : "This incident is already unassigned");
  const assignee = handledById ? await eligibleHandler(incident, handledById) : null;
  const updated = await prisma.biteIncident.update({ where: { id }, data: { handledById }, include: incidentInclude });
  if (assignee) await announceHandler(incident, assignee, user, note);
  return { before: incident, updated: redactIncident(user, updated), assignee: assignee ? { id: assignee.id, name: handlerName(assignee) } : null };
}

/** "I'm near it — I'll take this case." Ward officers and verified rescue orgs; first come, first served. */
export async function claimIncident(user: SessionUser, id: string) {
  const incident = await load(user, id);
  if (user.role === "RESCUE_ORG" && user.organizationStatus !== "VERIFIED") throw forbidden("Your organisation must be verified before it can take cases");
  if (!OPEN.includes(incident.status)) throw conflict(`This report is already ${STATUS_LABEL[incident.status].toLowerCase()}`);
  if (incident.handledById === user.id) throw conflict("You are already handling this case");
  if (incident.handledBy) throw conflict(`Already taken by ${handlerName(incident.handledBy)}`);
  const me = await eligibleHandler(incident, user.id);
  // Atomic: only succeeds if still unassigned (two teams clicking at once → one 409).
  const res = await prisma.biteIncident.updateMany({ where: { id, handledById: null }, data: { handledById: user.id } });
  if (!res.count) throw conflict("Someone else took this case a moment ago");
  await announceHandler(incident, me, user);
  const updated = await prisma.biteIncident.findUniqueOrThrow({ where: { id }, include: incidentInclude });
  return { before: incident, updated: redactIncident(user, updated), assignee: { id: me.id, name: handlerName(me) } };
}

/** The handler hands the case back to the unassigned queue. */
export async function releaseIncident(user: SessionUser, id: string, note?: string | null) {
  const incident = await load(user, id);
  if (incident.handledById !== user.id) throw forbidden("Only the team handling this case can release it");
  const updated = await prisma.biteIncident.update({ where: { id }, data: { handledById: null }, include: incidentInclude });
  for (const m of await monitoringUsers(incident.municipality)) {
    if (m.id === user.id) continue;
    await notify({
      userId: m.id,
      type: "INCIDENT_UPDATE",
      title: "Case released, needs a handler",
      message: `${incident.handledBy ? handlerName(incident.handledBy) : user.fullName} released the ${incident.animalType.toLowerCase()} bite report${note ? `: ${note}` : "."}`,
      link: `/app/incidents/${incident.id}`,
    });
  }
  return { before: incident, updated: redactIncident(user, updated) };
}

/** Public tracker by code (NP-XXXX-XXXX, or the legacy internal id): progress only, no personal data or exact location. */
export async function trackIncident(code: string) {
  return trackByCode(code);
}
