import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import { audit } from "../services/audit";
import * as incidents from "../services/incident.service";
import { clientIp, parseBody, parseList, rateLimit, param } from "../utils/http";
import { incidentAssignSchema, incidentCreateSchema, incidentReleaseSchema, incidentStatusSchema, incidentUpdateSchema } from "../validators";

export async function list(req: Request, res: Response) {
  res.json(await incidents.listIncidents(currentUser(req), parseList(req, ["incidentDate", "createdAt", "updatedAt", "severity", "status", "wardNumber"], "incidentDate")));
}

export async function create(req: Request, res: Response) {
  const user = req.user;
  rateLimit(`incident:${user?.id ?? clientIp(req)}`, user ? 20 : 5, 60 * 60_000);
  const incident = await incidents.createIncident(user, parseBody(req, incidentCreateSchema));
  await audit({
    actorId: user?.id ?? null,
    action: "INCIDENT_CREATED",
    entityType: "BiteIncident",
    entityId: incident.id,
    after: { severity: incident.severity, suspectedRabies: incident.suspectedRabies, municipality: incident.municipality, guest: !user },
    req,
  });
  res.status(201).json({
    id: incident.id,
    trackingCode: incident.trackingCode,
    status: incident.status,
    createdAt: incident.createdAt,
    trackingPath: user ? `/app/incidents/${incident.id}` : null,
    guidance:
      incident.severity !== "LOW" || incident.suspectedRabies
        ? "If a person was bitten or scratched: wash the wound with soap and running water for 15 minutes and visit a hospital today for anti-rabies treatment."
        : null,
  });
}

export async function get(req: Request, res: Response) {
  res.json(await incidents.getIncident(currentUser(req), param(req, "id")));
}

export async function update(req: Request, res: Response) {
  const user = currentUser(req);
  const body = parseBody(req, incidentUpdateSchema);
  const { before, updated } = await incidents.updateIncident(user, param(req, "id"), body);
  await audit({ actorId: user.id, action: "INCIDENT_UPDATED", entityType: "BiteIncident", entityId: before.id, before, after: body, req });
  res.json(updated);
}

export async function remove(req: Request, res: Response) {
  const user = currentUser(req);
  const incident = await incidents.deleteIncident(user, param(req, "id"));
  await audit({ actorId: user.id, action: "INCIDENT_DELETED", entityType: "BiteIncident", entityId: incident.id, before: incident, req });
  res.status(204).end();
}

export async function transition(req: Request, res: Response) {
  const user = currentUser(req);
  const { status, note } = parseBody(req, incidentStatusSchema);
  const { before, updated } = await incidents.transitionIncident(user, param(req, "id"), status, note);
  await audit({ actorId: user.id, action: "INCIDENT_STATUS_CHANGED", entityType: "BiteIncident", entityId: updated.id, before: { status: before.status }, after: { status, note }, req });
  res.json(updated);
}

export async function assignees(req: Request, res: Response) {
  res.json(await incidents.listAssignees(currentUser(req), param(req, "id")));
}

export async function assign(req: Request, res: Response) {
  const user = currentUser(req);
  const { handledById, note } = parseBody(req, incidentAssignSchema);
  const { before, updated, assignee } = await incidents.assignIncident(user, param(req, "id"), handledById, note);
  await auditHandler(req, "INCIDENT_ASSIGNED", before, assignee, note);
  res.json(updated);
}

export async function claim(req: Request, res: Response) {
  const { before, updated, assignee } = await incidents.claimIncident(currentUser(req), param(req, "id"));
  await auditHandler(req, "INCIDENT_CLAIMED", before, assignee);
  res.json(updated);
}

export async function release(req: Request, res: Response) {
  const { note } = parseBody(req, incidentReleaseSchema);
  const { before, updated } = await incidents.releaseIncident(currentUser(req), param(req, "id"), note);
  await auditHandler(req, "INCIDENT_RELEASED", before, null, note);
  res.json(updated);
}

type HandlerRef = { id: string; fullName: string; rescueOrganization: { organizationName: string } | null } | null;
async function auditHandler(req: Request, action: "INCIDENT_ASSIGNED" | "INCIDENT_CLAIMED" | "INCIDENT_RELEASED", before: { id: string; handledById: string | null; handledBy: HandlerRef }, assignee: { id: string; name: string } | null, note?: string | null) {
  await audit({
    actorId: currentUser(req).id,
    action,
    entityType: "BiteIncident",
    entityId: before.id,
    before: { handledById: before.handledById, handledBy: before.handledBy ? (before.handledBy.rescueOrganization?.organizationName ?? before.handledBy.fullName) : null },
    after: { handledById: assignee?.id ?? null, handledBy: assignee?.name ?? null, note: note ?? undefined },
    req,
  });
}

export async function track(req: Request, res: Response) {
  rateLimit(`track:${clientIp(req)}`, 30, 10 * 60_000);
  res.set("Cache-Control", "no-store").json(await incidents.trackIncident(param(req, "code").trim()));
}
