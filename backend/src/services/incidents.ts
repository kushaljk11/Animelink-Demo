import type { BiteIncident } from "@prisma/client";
import { prisma } from "../config/db";
import { boundingBox, bboxWhere, haversineKm } from "./geo";
import { notify } from "./notify";

const CLUSTER_RADIUS_KM = 0.6;
const CLUSTER_WINDOW_DAYS = 14;
const CLUSTER_MIN_REPORTS = 3;

export async function monitoringUsers(municipality: string | null) {
  return prisma.user.findMany({
    where: {
      isActive: true,
      OR: [{ role: "ADMIN" }, { role: "WARD_OFFICER", ...(municipality ? { OR: [{ municipality }, { municipality: null }] } : {}) }],
    },
    select: { id: true, role: true },
  });
}

/**
 * Real-time alerts on submission (Section N.4 "Relevant authorities can monitor"):
 *  - every suspected-rabies or HIGH-severity report notifies ward officers of that municipality
 *  - ≥3 reports within 600 m in 14 days raises a one-per-week CLUSTER_ALERT for the area
 */
export async function raiseIncidentAlerts(incident: BiteIncident) {
  const officers = await monitoringUsers(incident.municipality);
  const where = [incident.address, incident.wardNumber ? `Ward ${incident.wardNumber}` : null, incident.municipality].filter(Boolean).join(", ");

  if (incident.suspectedRabies || incident.severity === "HIGH") {
    for (const o of officers) {
      await notify({
        userId: o.id,
        type: "INCIDENT_UPDATE",
        title: incident.suspectedRabies ? "New suspected-rabies report" : "New high-severity bite report",
        message: `${incident.animalType.toLowerCase()} incident${where ? ` at ${where}` : ""} on ${incident.incidentDate.toISOString().slice(0, 10)}.`,
        link: `/app/incidents/${incident.id}`,
        dedupeKey: `incident:${incident.id}:new:${o.id}`,
      });
    }
  }

  const since = new Date(Date.now() - CLUSTER_WINDOW_DAYS * 86_400_000);
  const center = { lat: incident.latitude, lng: incident.longitude };
  const nearby = await prisma.biteIncident.findMany({
    where: {
      ...bboxWhere(boundingBox(center, CLUSTER_RADIUS_KM), "latitude", "longitude"),
      incidentDate: { gte: since },
      status: { not: "DISMISSED" },
    },
    select: { id: true, latitude: true, longitude: true, suspectedRabies: true },
  });
  const inRange = nearby.filter((n) => haversineKm(center, { lat: n.latitude, lng: n.longitude }) <= CLUSTER_RADIUS_KM);
  if (inRange.length < CLUSTER_MIN_REPORTS) return;

  // One alert per ~600 m cell per ISO week, per officer.
  const cell = `${Math.round(incident.latitude / 0.0054)}:${Math.round(incident.longitude / 0.0061)}`;
  const week = Math.floor(Date.now() / (7 * 86_400_000));
  const suspected = inRange.filter((n) => n.suspectedRabies).length;
  for (const o of officers) {
    await notify({
      userId: o.id,
      type: "CLUSTER_ALERT",
      title: `Incident cluster detected${where ? ` near ${where}` : ""}`,
      message: `${inRange.length} reports within ${CLUSTER_RADIUS_KM * 1000} m in the last ${CLUSTER_WINDOW_DAYS} days (${suspected} suspected rabies). This reflects reported activity, not confirmed cases.`,
      link: `/app/map?focus=${incident.latitude.toFixed(5)},${incident.longitude.toFixed(5)}&layer=clusters`,
      dedupeKey: `cluster:${cell}:${week}:${o.id}`,
    });
  }
}
