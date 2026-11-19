// Spatial queries (Section S). PostGIS equivalents:
//   ST_DWithin → bounding-box SQL pre-filter + haversine refinement (geo.ts)
//   ST_ClusterDBSCAN → dbscan()        risk areas → riskGrid()
import type { z } from "zod";
import { prisma } from "../config/db";
import type { clusterQuerySchema, mapQuerySchema, nearbyQuerySchema, riskQuerySchema, withinQuerySchema } from "../validators";
import { hasRole, type SessionUser } from "./auth.service";
import { boundingBox, bboxWhere, coarsen, dbscan, riskGrid, withinRadius, type ActivityLevel } from "./geo";
import { collection, point } from "./geojson";
import { assertCanViewStrays, incidentScope, redactIncident } from "./rbac";
import { unauthorized } from "../utils/http";

const range = (field: string, from?: Date, to?: Date) => (from || to ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {});
const pt = (r: { latitude: number; longitude: number }) => ({ lat: r.latitude, lng: r.longitude });

/** Nearby verified vets and shelters, sorted by great-circle distance (N.5). */
export async function nearby(q: z.output<typeof nearbyQuerySchema>) {
  const center = { lat: q.lat, lng: q.lng };
  const box = bboxWhere(boundingBox(center, q.radiusKm), "latitude", "longitude");
  const status = q.verifiedOnly ? { verificationStatus: "VERIFIED" as const } : {};
  const [clinics, shelters] = await Promise.all([
    q.types.includes("clinic")
      ? prisma.veterinaryClinic.findMany({ where: { ...box, ...status }, select: { id: true, clinicName: true, phone: true, address: true, latitude: true, longitude: true, openingHours: true, municipality: true, wardNumber: true, serviceRadiusKm: true } })
      : [],
    q.types.includes("shelter")
      ? prisma.rescueOrganization.findMany({ where: { ...box, ...status }, select: { id: true, organizationName: true, phone: true, address: true, latitude: true, longitude: true, hasShelter: true, municipality: true, wardNumber: true, serviceRadiusKm: true } })
      : [],
  ]);
  const results = [
    ...withinRadius(clinics.map((c) => ({ type: "clinic" as const, name: c.clinicName, ...c })), center, q.radiusKm, pt),
    ...withinRadius(shelters.map((s) => ({ type: "shelter" as const, name: s.organizationName, ...s })), center, q.radiusKm, pt),
  ]
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, q.limit)
    .map((r) => ({ ...r, withinServiceArea: r.distanceKm <= r.serviceRadiusKm }));
  return { center, radiusKm: q.radiusKm, count: results.length, results };
}

/** Radius query on any layer, with the same RBAC as the list endpoints. */
export async function within(user: SessionUser | null, q: z.output<typeof withinQuerySchema>) {
  const center = { lat: q.lat, lng: q.lng };
  const box = boundingBox(center, q.radiusKm);
  let results: unknown[];
  switch (q.layer) {
    case "incidents": {
      if (!user) throw unauthorized();
      const rows = await prisma.biteIncident.findMany({ where: { AND: [incidentScope(user), bboxWhere(box, "latitude", "longitude"), range("incidentDate", q.from, q.to)] }, take: 2000 });
      results = withinRadius(rows, center, q.radiusKm, pt).map((r) => redactIncident(user, r));
      break;
    }
    case "strays": {
      if (!user) throw unauthorized();
      assertCanViewStrays(user);
      const rows = await prisma.communityStray.findMany({ where: { ...bboxWhere(box, "latitude", "longitude"), ...range("createdAt", q.from, q.to) }, include: { _count: { select: { cnvrRecords: true } } }, take: 2000 });
      results = withinRadius(rows, center, q.radiusKm, pt);
      break;
    }
    case "cnvr": {
      if (!user) throw unauthorized();
      assertCanViewStrays(user);
      const rows = await prisma.cnvrRecord.findMany({
        where: { ...bboxWhere(box, "releaseLatitude", "releaseLongitude"), ...range("createdAt", q.from, q.to) },
        include: { stray: { select: { id: true, tagOrEarMark: true, color: true } }, organization: { select: { organizationName: true } } },
        take: 2000,
      });
      results = withinRadius(rows, center, q.radiusKm, (r) => (r.releaseLatitude != null && r.releaseLongitude != null ? { lat: r.releaseLatitude, lng: r.releaseLongitude } : null));
      break;
    }
    case "clinics":
      results = withinRadius(await prisma.veterinaryClinic.findMany({ where: { ...bboxWhere(box, "latitude", "longitude"), verificationStatus: "VERIFIED" } }), center, q.radiusKm, pt);
      break;
    case "shelters":
      results = withinRadius(await prisma.rescueOrganization.findMany({ where: { ...bboxWhere(box, "latitude", "longitude"), verificationStatus: "VERIFIED" } }), center, q.radiusKm, pt);
      break;
    case "lost": {
      const rows = await prisma.lostPetReport.findMany({
        where: { status: "ACTIVE", ...bboxWhere(box, "lastSeenLatitude", "lastSeenLongitude"), ...range("lastSeenDate", q.from, q.to) },
        include: { pet: { select: { name: true, species: true, breed: true, color: true, photoUrl: true, ownerId: true } } },
      });
      results = withinRadius(rows, center, q.radiusKm, (r) => (r.lastSeenLatitude != null && r.lastSeenLongitude != null ? { lat: r.lastSeenLatitude, lng: r.lastSeenLongitude } : null)).map((r) => {
        if (user && (user.role === "ADMIN" || r.pet.ownerId === user.id)) return r;
        const { ownerId: _o, ...pet } = r.pet;
        return { id: r.id, lastSeenDate: r.lastSeenDate, lastSeenApprox: coarsen({ lat: r.lastSeenLatitude!, lng: r.lastSeenLongitude! }), distanceKm: r.distanceKm, pet };
      });
      break;
    }
  }
  return { layer: q.layer, center, radiusKm: q.radiusKm, count: results.length, results: results.slice(0, q.limit) };
}

/** DBSCAN over incident reports (defaults: last 30 days, eps 600 m, ≥3 reports). */
export async function clusters(user: SessionUser, q: z.output<typeof clusterQuerySchema>) {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 30 * 86_400_000);
  const incidents = await prisma.biteIncident.findMany({
    where: {
      AND: [
        incidentScope(user),
        { incidentDate: { gte: from, lte: to } },
        { status: { not: "DISMISSED" } },
        q.suspectedOnly ? { suspectedRabies: true } : {},
        q.municipality ? { municipality: q.municipality } : {},
        q.wardNumber ? { wardNumber: q.wardNumber } : {},
      ],
    },
    select: { id: true, latitude: true, longitude: true, severity: true, suspectedRabies: true, incidentDate: true, wardNumber: true, municipality: true, status: true, animalType: true },
  });
  const { clusters: found, noise } = dbscan(incidents.map((i) => ({ lat: i.latitude, lng: i.longitude, item: i })), q.epsKm, q.minPts);
  const result = found.map((c) => {
    const suspected = c.members.filter((m) => m.suspectedRabies).length;
    const high = c.members.filter((m) => m.severity === "HIGH").length;
    const score = c.count + suspected + 0.5 * high;
    const level: ActivityLevel = score >= 8 ? "HIGH" : score >= 4 ? "MODERATE" : "LOW";
    const dates = c.members.map((m) => m.incidentDate.getTime());
    return {
      id: c.id,
      level,
      score,
      count: c.count,
      suspectedRabies: suspected,
      highSeverity: high,
      center: c.center,
      radiusKm: c.radiusKm,
      bbox: c.bbox,
      firstReport: new Date(Math.min(...dates)),
      lastReport: new Date(Math.max(...dates)),
      wards: [...new Set(c.members.map((m) => (m.wardNumber ? `${m.municipality ?? ""} ${m.wardNumber}`.trim() : null)).filter(Boolean))],
      animalTypes: Object.entries(c.members.reduce<Record<string, number>>((acc, m) => ((acc[m.animalType] = (acc[m.animalType] ?? 0) + 1), acc), {})).map(([animalType, count]) => ({ animalType, count })),
      incidentIds: c.members.map((m) => m.id),
    };
  });
  return {
    params: { from, to, epsKm: q.epsKm, minPts: q.minPts, suspectedOnly: q.suspectedOnly },
    totals: { incidents: incidents.length, clustered: incidents.length - noise.length, isolated: noise.length, clusters: result.length },
    clusters: result,
    disclaimer: "Clusters show concentrations of reported incidents. They are not a medical diagnosis or confirmed rabies risk.",
  };
}

/** ~1 km activity grid; anonymous viewers never see single-report cells. */
export async function riskAreas(user: SessionUser | null, q: z.output<typeof riskQuerySchema>) {
  const privileged = hasRole(user, "WARD_OFFICER", "RESCUE_ORG");
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 30 * 86_400_000);
  const incidents = await prisma.biteIncident.findMany({
    where: { incidentDate: { gte: from, lte: to }, status: { not: "DISMISSED" }, ...(q.municipality ? { municipality: q.municipality } : {}) },
    select: { latitude: true, longitude: true, suspectedRabies: true, severity: true },
  });
  const cells = riskGrid(incidents.map((i) => ({ lat: i.latitude, lng: i.longitude, suspectedRabies: i.suspectedRabies, severity: i.severity })), q.cellKm).filter((c) => privileged || c.count >= 2);
  return {
    params: { from, to, cellKm: q.cellKm },
    legend: { LOW: "Few reports in this area", MODERATE: "Several reports in this area", HIGH: "Many reports, including suspected rabies or severe bites" },
    summary: { HIGH: cells.filter((c) => c.level === "HIGH").length, MODERATE: cells.filter((c) => c.level === "MODERATE").length, LOW: cells.filter((c) => c.level === "LOW").length },
    cells,
    disclaimer: "Levels reflect the concentration of reported incidents, not verified rabies cases.",
  };
}

/** One call for the Leaflet map: GeoJSON per layer; layers the role cannot see go to `hidden`. */
export async function mapLayers(user: SessionUser | null, q: z.output<typeof mapQuerySchema>) {
  const view = q.minLat != null && q.maxLat != null && q.minLng != null && q.maxLng != null ? { minLat: q.minLat, maxLat: q.maxLat, minLng: q.minLng, maxLng: q.maxLng } : null;
  const inView = (lat: string, lng: string) => (view ? { [lat]: { gte: view.minLat, lte: view.maxLat }, [lng]: { gte: view.minLng, lte: view.maxLng } } : {});
  const dates = (field: string) => range(field, q.from, q.to);
  const area = { ...(q.municipality ? { municipality: q.municipality } : {}), ...(q.wardNumber ? { wardNumber: q.wardNumber } : {}) };
  const canStrays = hasRole(user, "RESCUE_ORG", "WARD_OFFICER", "VET_CLINIC");
  const layers: Record<string, unknown> = {};
  const hidden: string[] = [];

  for (const layer of q.layers) {
    if (layer === "incidents") {
      if (!user) {
        hidden.push(layer);
        continue;
      }
      const rows = await prisma.biteIncident.findMany({
        where: { AND: [incidentScope(user), inView("latitude", "longitude"), dates("incidentDate"), area] },
        select: { id: true, latitude: true, longitude: true, severity: true, suspectedRabies: true, status: true, animalType: true, incidentDate: true, wardNumber: true, municipality: true },
        take: 5000,
      });
      layers.incidents = collection(rows.map(({ id, latitude, longitude, ...p }) => point(id, latitude, longitude, p)));
    } else if (layer === "strays" || layer === "cnvr") {
      if (!canStrays) {
        hidden.push(layer);
        continue;
      }
      if (layer === "strays") {
        const rows = await prisma.communityStray.findMany({
          where: { ...inView("latitude", "longitude"), ...dates("createdAt"), ...area },
          select: { id: true, latitude: true, longitude: true, tagOrEarMark: true, color: true, gender: true, photoUrl: true, cnvrRecords: { select: { sterilizationDate: true, vaccinationDate: true } } },
          take: 5000,
        });
        layers.strays = collection(
          rows.map(({ id, latitude, longitude, cnvrRecords, ...p }) =>
            point(id, latitude, longitude, { ...p, sterilized: cnvrRecords.some((c) => c.sterilizationDate), vaccinated: cnvrRecords.some((c) => c.vaccinationDate) }),
          ),
        );
      } else {
        const rows = await prisma.cnvrRecord.findMany({
          where: { releaseLatitude: { not: null }, ...inView("releaseLatitude", "releaseLongitude"), ...dates("createdAt"), ...(Object.keys(area).length ? { stray: area } : {}) },
          select: { id: true, releaseLatitude: true, releaseLongitude: true, releaseDate: true, vaccinationDate: true, sterilizationDate: true, strayId: true, organization: { select: { organizationName: true } } },
          take: 5000,
        });
        layers.cnvr = collection(rows.map(({ id, releaseLatitude, releaseLongitude, organization, ...p }) => point(id, releaseLatitude!, releaseLongitude!, { ...p, organizationName: organization.organizationName })));
      }
    } else if (layer === "clinics") {
      const rows = await prisma.veterinaryClinic.findMany({ where: { verificationStatus: "VERIFIED", ...inView("latitude", "longitude"), ...area }, select: { id: true, latitude: true, longitude: true, clinicName: true, phone: true, address: true, openingHours: true } });
      layers.clinics = collection(rows.map(({ id, latitude, longitude, ...p }) => point(id, latitude, longitude, p)));
    } else if (layer === "shelters") {
      const rows = await prisma.rescueOrganization.findMany({ where: { verificationStatus: "VERIFIED", ...inView("latitude", "longitude"), ...area }, select: { id: true, latitude: true, longitude: true, organizationName: true, phone: true, address: true, hasShelter: true } });
      layers.shelters = collection(rows.map(({ id, latitude, longitude, ...p }) => point(id, latitude, longitude, p)));
    } else if (layer === "lost") {
      const rows = await prisma.lostPetReport.findMany({
        where: { status: "ACTIVE", lastSeenLatitude: { not: null }, ...inView("lastSeenLatitude", "lastSeenLongitude"), ...dates("lastSeenDate") },
        select: { id: true, lastSeenLatitude: true, lastSeenLongitude: true, lastSeenDate: true, pet: { select: { name: true, species: true, photoUrl: true, qrToken: true } } },
      });
      layers.lost = collection(
        rows.map((r) => {
          const c = coarsen({ lat: r.lastSeenLatitude!, lng: r.lastSeenLongitude! });
          return point(r.id, c.lat, c.lng, { lastSeenDate: r.lastSeenDate, petName: r.pet.name, species: r.pet.species, photoUrl: r.pet.photoUrl, profilePath: `/p/${r.pet.qrToken}`, approximate: true });
        }),
      );
    }
  }
  return { layers, hidden, generatedAt: new Date().toISOString() };
}
