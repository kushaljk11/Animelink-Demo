// Reports (CSV / PDF export), audit trail queries and global search.
import { IncidentStatus, VaccinationRecordStatus, VerificationStatus, type Prisma, type Role } from "@prisma/client";
import { prisma } from "../config/db";
import { enumFilter, forbidden, paginated, type ListParams } from "../utils/http";
import { exportQuerySchema, EXPORT_ENTITIES } from "../validators";
import { hasRole, type SessionUser } from "./auth.service";
import { toCsv, type CsvColumn } from "./csv";
import { tableReportPdf } from "./pdf";
import { incidentScope, petScope } from "./rbac";
import { boosterStatus, summarizeVaccinations } from "./vaccination";


type Entity = (typeof EXPORT_ENTITIES)[number];
type Col = { header: string; width: number; value: (r: never) => unknown };

/** Who may export what (Section K.4 "Export authorized reports"). ADMIN may export everything. */
const ACCESS: Record<Entity, Role[]> = {
  incidents: ["WARD_OFFICER"],
  vaccinations: ["WARD_OFFICER", "VET_CLINIC"],
  cnvr: ["WARD_OFFICER", "RESCUE_ORG"],
  strays: ["WARD_OFFICER", "RESCUE_ORG"],
  pets: [],
  clinics: ["WARD_OFFICER"],
  organizations: ["WARD_OFFICER"],
};

const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");
const range = (field: string, from?: Date, to?: Date) =>
  from || to ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

async function load(entity: Entity, user: SessionUser, q: ReturnType<typeof exportQuerySchema.parse>) {
  const area = { ...(q.municipality ? { municipality: q.municipality } : {}), ...(q.wardNumber ? { wardNumber: q.wardNumber } : {}) };
  const statuses = q.status?.split(",").filter(Boolean);
  const LIMIT = 10_000;

  switch (entity) {
    case "incidents": {
      const s = enumFilter(statuses, IncidentStatus);
      const rows = await prisma.biteIncident.findMany({
        where: { AND: [incidentScope(user), area, range("incidentDate", q.from, q.to), s ? { status: { in: s } } : {}] },
        orderBy: { incidentDate: "desc" },
        take: LIMIT,
      });
      const cols: Col[] = [
        { header: "Incident ID", width: 120, value: (r: (typeof rows)[number]) => r.id },
        { header: "Date", width: 65, value: (r: (typeof rows)[number]) => d(r.incidentDate) },
        { header: "Animal", width: 60, value: (r: (typeof rows)[number]) => r.animalType },
        { header: "Severity", width: 60, value: (r: (typeof rows)[number]) => r.severity },
        { header: "Suspected rabies", width: 60, value: (r: (typeof rows)[number]) => (r.suspectedRabies ? "Yes" : "No") },
        { header: "Status", width: 75, value: (r: (typeof rows)[number]) => r.status },
        { header: "Municipality", width: 95, value: (r: (typeof rows)[number]) => r.municipality ?? "" },
        { header: "Ward", width: 35, value: (r: (typeof rows)[number]) => r.wardNumber ?? "" },
        { header: "Location", width: 110, value: (r: (typeof rows)[number]) => r.address ?? "" },
        { header: "Latitude", width: 55, value: (r: (typeof rows)[number]) => r.latitude.toFixed(5) },
        { header: "Longitude", width: 55, value: (r: (typeof rows)[number]) => r.longitude.toFixed(5) },
        { header: "Description", width: 180, value: (r: (typeof rows)[number]) => r.description },
      ];
      return { rows, cols };
    }
    case "vaccinations": {
      const s = enumFilter(statuses, VaccinationRecordStatus);
      const rows = await prisma.vaccinationRecord.findMany({
        where: {
          ...(user.role === "VET_CLINIC" ? { vetId: user.clinicId ?? "__none__" } : {}),
          ...range("administeredDate", q.from, q.to),
          ...(s ? { status: { in: s } } : {}),
          ...(q.municipality || q.wardNumber ? { pet: { owner: area } } : {}),
        },
        include: { pet: { select: { name: true, species: true } }, clinic: { select: { clinicName: true } } },
        orderBy: { administeredDate: "desc" },
        take: LIMIT,
      });
      type R = (typeof rows)[number];
      const cols: Col[] = [
        { header: "Pet", width: 80, value: (r: R) => r.pet.name },
        { header: "Species", width: 50, value: (r: R) => r.pet.species },
        { header: "Vaccine", width: 110, value: (r: R) => r.vaccineName },
        { header: "Batch", width: 70, value: (r: R) => r.batchNumber },
        { header: "Administered", width: 70, value: (r: R) => d(r.administeredDate) },
        { header: "Booster due", width: 70, value: (r: R) => d(r.boosterDueDate) },
        { header: "Booster status", width: 75, value: (r: R) => boosterStatus(r.boosterDueDate) },
        { header: "Record status", width: 95, value: (r: R) => r.status },
        { header: "Clinic", width: 150, value: (r: R) => r.clinic.clinicName },
        { header: "Verified at", width: 70, value: (r: R) => d(r.verifiedAt) },
      ];
      return { rows, cols };
    }
    case "cnvr": {
      const rows = await prisma.cnvrRecord.findMany({
        where: {
          ...(user.role === "RESCUE_ORG" && user.organizationId ? { organizationId: user.organizationId } : {}),
          ...range("createdAt", q.from, q.to),
          ...(q.municipality || q.wardNumber ? { stray: area } : {}),
        },
        include: { stray: { select: { tagOrEarMark: true, color: true, gender: true, municipality: true, wardNumber: true } }, organization: { select: { organizationName: true } } },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
      });
      type R = (typeof rows)[number];
      const cols: Col[] = [
        { header: "CNVR ID", width: 120, value: (r: R) => r.id },
        { header: "Tag / ear mark", width: 75, value: (r: R) => r.stray.tagOrEarMark ?? "" },
        { header: "Gender", width: 50, value: (r: R) => r.stray.gender },
        { header: "Organisation", width: 140, value: (r: R) => r.organization.organizationName },
        { header: "Vaccine", width: 90, value: (r: R) => r.vaccineName ?? "" },
        { header: "Vaccinated", width: 65, value: (r: R) => d(r.vaccinationDate) },
        { header: "Sterilised", width: 65, value: (r: R) => d(r.sterilizationDate) },
        { header: "Released", width: 65, value: (r: R) => d(r.releaseDate) },
        { header: "Municipality", width: 90, value: (r: R) => r.stray.municipality ?? "" },
        { header: "Ward", width: 35, value: (r: R) => r.stray.wardNumber ?? "" },
        { header: "Release lat", width: 55, value: (r: R) => r.releaseLatitude?.toFixed(5) ?? "" },
        { header: "Release lng", width: 55, value: (r: R) => r.releaseLongitude?.toFixed(5) ?? "" },
      ];
      return { rows, cols };
    }
    case "strays": {
      const rows = await prisma.communityStray.findMany({
        where: { ...area, ...range("createdAt", q.from, q.to) },
        include: { cnvrRecords: { select: { sterilizationDate: true, vaccinationDate: true } } },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
      });
      type R = (typeof rows)[number];
      const cols: Col[] = [
        { header: "Stray ID", width: 120, value: (r: R) => r.id },
        { header: "Tag / ear mark", width: 75, value: (r: R) => r.tagOrEarMark ?? "" },
        { header: "Gender", width: 50, value: (r: R) => r.gender },
        { header: "Est. age", width: 55, value: (r: R) => r.estimatedAge ?? "" },
        { header: "Colour", width: 75, value: (r: R) => r.color ?? "" },
        { header: "Sterilised", width: 55, value: (r: R) => (r.cnvrRecords.some((c) => c.sterilizationDate) ? "Yes" : "No") },
        { header: "Vaccinated", width: 55, value: (r: R) => (r.cnvrRecords.some((c) => c.vaccinationDate) ? "Yes" : "No") },
        { header: "Municipality", width: 90, value: (r: R) => r.municipality ?? "" },
        { header: "Ward", width: 35, value: (r: R) => r.wardNumber ?? "" },
        { header: "Location", width: 110, value: (r: R) => r.address ?? "" },
        { header: "Registered", width: 65, value: (r: R) => d(r.createdAt) },
      ];
      return { rows, cols };
    }
    case "pets": {
      const rows = await prisma.pet.findMany({
        where: { ...range("createdAt", q.from, q.to), ...(q.municipality || q.wardNumber ? { owner: area } : {}) },
        include: { owner: { select: { municipality: true, wardNumber: true } }, vaccinationRecords: { select: { id: true, vaccineName: true, administeredDate: true, boosterDueDate: true, status: true } } },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
      });
      type R = (typeof rows)[number];
      // Owner identity is deliberately excluded from bulk exports (Section U data minimisation).
      const cols: Col[] = [
        { header: "Pet ID", width: 120, value: (r: R) => r.id },
        { header: "Name", width: 80, value: (r: R) => r.name },
        { header: "Species", width: 50, value: (r: R) => r.species },
        { header: "Breed", width: 110, value: (r: R) => r.breed ?? "" },
        { header: "Gender", width: 50, value: (r: R) => r.gender },
        { header: "Vaccination status", width: 100, value: (r: R) => summarizeVaccinations(r.vaccinationRecords).status },
        { header: "Lost", width: 35, value: (r: R) => (r.lostStatus ? "Yes" : "No") },
        { header: "Municipality", width: 90, value: (r: R) => r.owner.municipality ?? "" },
        { header: "Ward", width: 35, value: (r: R) => r.owner.wardNumber ?? "" },
        { header: "Registered", width: 65, value: (r: R) => d(r.createdAt) },
      ];
      return { rows, cols };
    }
    case "clinics":
    case "organizations": {
      const s = enumFilter(statuses, VerificationStatus);
      const where = { ...area, ...range("createdAt", q.from, q.to), ...(s ? { verificationStatus: { in: s } } : {}) };
      const rows =
        entity === "clinics"
          ? (await prisma.veterinaryClinic.findMany({ where, include: { _count: { select: { vaccinationRecords: true } } }, orderBy: { clinicName: "asc" }, take: LIMIT })).map((c) => ({
              name: c.clinicName, reg: c.registrationNumber, phone: c.phone, address: c.address, municipality: c.municipality, ward: c.wardNumber, status: c.verificationStatus, activity: c._count.vaccinationRecords, lat: c.latitude, lng: c.longitude,
            }))
          : (await prisma.rescueOrganization.findMany({ where, include: { _count: { select: { cnvrRecords: true } } }, orderBy: { organizationName: "asc" }, take: LIMIT })).map((o) => ({
              name: o.organizationName, reg: o.hasShelter ? "Shelter" : "Field rescue", phone: o.phone, address: o.address, municipality: o.municipality, ward: o.wardNumber, status: o.verificationStatus, activity: o._count.cnvrRecords, lat: o.latitude, lng: o.longitude,
            }));
      type R = (typeof rows)[number];
      const cols: Col[] = [
        { header: "Name", width: 150, value: (r: R) => r.name },
        { header: entity === "clinics" ? "Registration no." : "Type", width: 80, value: (r: R) => r.reg },
        { header: "Phone", width: 80, value: (r: R) => r.phone },
        { header: "Address", width: 140, value: (r: R) => r.address },
        { header: "Municipality", width: 90, value: (r: R) => r.municipality ?? "" },
        { header: "Ward", width: 35, value: (r: R) => r.ward ?? "" },
        { header: "Verification", width: 70, value: (r: R) => r.status },
        { header: entity === "clinics" ? "Vaccinations" : "CNVR records", width: 65, value: (r: R) => r.activity },
        { header: "Latitude", width: 55, value: (r: R) => r.lat.toFixed(5) },
        { header: "Longitude", width: 55, value: (r: R) => r.lng.toFixed(5) },
      ];
      return { rows, cols };
    }
  }
}


export type ExportQuery = ReturnType<typeof exportQuerySchema.parse>;

/** Builds a CSV or PDF for one dataset, enforcing per-role access (Section K.4). */
export async function exportReport(user: SessionUser, q: ExportQuery) {
  if (user.role !== "ADMIN" && !ACCESS[q.entity].includes(user.role)) throw forbidden(`Your role cannot export ${q.entity}`);
  const { rows, cols } = await load(q.entity, user, q);
  const filename = `rabies-track-${q.entity}-${new Date().toISOString().slice(0, 10)}.${q.format}`;
  if (q.format === "csv") {
    const csv = toCsv(
      cols.map((c) => ({ header: c.header, value: c.value as CsvColumn<unknown>["value"] })),
      rows as unknown[],
    );
    return { filename, contentType: "text/csv; charset=utf-8", body: csv, rowCount: rows.length };
  }
  const filters = [
    q.from ? `from ${d(q.from)}` : null,
    q.to ? `to ${d(q.to)}` : null,
    q.municipality,
    q.wardNumber ? `ward ${q.wardNumber}` : null,
    q.status ? `status ${q.status}` : null,
  ].filter(Boolean);
  const pdf = await tableReportPdf({
    title: `Rabies Track Nepal - ${q.entity[0]!.toUpperCase()}${q.entity.slice(1)} report`,
    subtitle: `Exported by ${user.fullName} (${user.role})${filters.length ? ` - filters: ${filters.join(", ")}` : ""}`,
    columns: cols.map((c) => ({ header: c.header, width: c.width })),
    rows: (rows as unknown[]).map((r) => cols.map((c) => String((c.value as (x: unknown) => unknown)(r) ?? ""))),
  });
  return { filename, contentType: "application/pdf", body: Buffer.from(pdf), rowCount: rows.length };
}

// ------------------------------------------------------------------- audit

const OFFICER_ENTITIES = ["BiteIncident", "CnvrRecord", "CommunityStray", "Report"];

/** Ward officers review incident/CNVR history; admins see everything (Section U). */
export async function listAudit(user: SessionUser, p: ListParams) {
  const entityType = p.sp.get("entityType");
  const entityId = p.sp.get("entityId");
  const actorId = p.sp.get("actorId");
  const actions = p.sp.get("action")?.split(",").filter(Boolean);
  const ci = p.query ? { contains: p.query, mode: "insensitive" as const } : undefined;
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      user.role === "ADMIN" ? {} : { entityType: { in: OFFICER_ENTITIES } },
      entityType ? { entityType } : {},
      entityId ? { entityId } : {},
      actorId ? { actorId } : {},
      actions?.length ? { action: { in: actions } } : {},
      range("createdAt", p.from, p.to),
      ci ? { OR: [{ action: ci }, { entityId: ci }, { actor: { fullName: ci } }] } : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: p.orderBy, skip: p.skip, take: p.take, include: { actor: { select: { id: true, fullName: true, role: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  const parse = (s: string | null) => {
    if (!s) return null;
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return s;
    }
  };
  return paginated(rows.map((r) => ({ ...r, before: parse(r.before), after: parse(r.after) })), total, p);
}

// ------------------------------------------------------------------ search

type Hit = { type: string; id: string; title: string; subtitle: string; href: string; score: number };

/** exact > prefix > word-prefix > substring > in-order subsequence. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.split(/[\s\-_/,.]+/).some((w) => w.startsWith(q))) return 65;
  const idx = t.indexOf(q);
  if (idx >= 0) return 50 - Math.min(idx, 20);
  let ti = 0;
  let gaps = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    gaps += found - ti;
    ti = found + 1;
  }
  return Math.max(1, 30 - gaps);
}

/** Role-aware global search for the command palette. */
export async function search(user: SessionUser, q: string, limit: number) {
  const like = { contains: q, mode: "insensitive" as const };
  const take = limit * 3;
  const groups: Record<string, Hit[]> = {};
  const rank = (type: string, hits: Omit<Hit, "type" | "score">[]) => {
    groups[type] = hits
      .map((h) => ({ ...h, type, score: Math.max(fuzzyScore(q, h.title), fuzzyScore(q, h.subtitle)) }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  };
  const tasks: Promise<void>[] = [];
  let pScope: Prisma.PetWhereInput | null = null;
  try {
    pScope = petScope(user);
  } catch {
    pScope = null;
  }
  if (pScope) {
    tasks.push(
      prisma.pet
        .findMany({ where: { AND: [pScope, { OR: [{ name: like }, { breed: like }, { color: like }] }] }, take, select: { id: true, name: true, species: true, breed: true, lostStatus: true } })
        .then((rows) => rank("pets", rows.map((r) => ({ id: r.id, title: r.name, subtitle: [r.species, r.breed, r.lostStatus ? "LOST" : null].filter(Boolean).join(" · "), href: `/app/pets/${r.id}` })))),
    );
  }
  tasks.push(
    prisma.biteIncident
      .findMany({ where: { AND: [incidentScope(user), { OR: [{ description: like }, { address: like }, { municipality: like }] }] }, take, select: { id: true, address: true, municipality: true, wardNumber: true, severity: true, status: true, incidentDate: true } })
      .then((rows) =>
        rank(
          "incidents",
          rows.map((r) => ({
            id: r.id,
            title: r.address ?? `${r.municipality ?? "Incident"}${r.wardNumber ? ` ward ${r.wardNumber}` : ""}`,
            subtitle: `${r.severity} · ${r.status} · ${d(r.incidentDate)}`,
            href: `/app/incidents/${r.id}`,
          })),
        ),
      ),
  );
  if (hasRole(user, "RESCUE_ORG", "WARD_OFFICER", "VET_CLINIC")) {
    tasks.push(
      prisma.communityStray
        .findMany({ where: { OR: [{ tagOrEarMark: like }, { address: like }, { color: like }, { physicalDescription: like }] }, take, select: { id: true, tagOrEarMark: true, address: true, color: true, municipality: true } })
        .then((rows) => rank("strays", rows.map((r) => ({ id: r.id, title: r.tagOrEarMark ?? `${r.color ?? "Unmarked"} stray`, subtitle: [r.address, r.municipality].filter(Boolean).join(", "), href: `/app/strays/${r.id}` })))),
    );
  }
  const verifiedOnly = hasRole(user, "WARD_OFFICER") ? {} : { verificationStatus: "VERIFIED" as const };
  tasks.push(
    prisma.veterinaryClinic
      .findMany({ where: { OR: [{ clinicName: like }, { address: like }], ...verifiedOnly }, take, select: { id: true, clinicName: true, address: true, verificationStatus: true } })
      .then((rows) => rank("clinics", rows.map((r) => ({ id: r.id, title: r.clinicName, subtitle: `${r.address} · ${r.verificationStatus}`, href: `/app/clinics/${r.id}` })))),
    prisma.rescueOrganization
      .findMany({ where: { OR: [{ organizationName: like }, { address: like }], ...verifiedOnly }, take, select: { id: true, organizationName: true, address: true, verificationStatus: true } })
      .then((rows) => rank("organizations", rows.map((r) => ({ id: r.id, title: r.organizationName, subtitle: `${r.address} · ${r.verificationStatus}`, href: `/app/organizations/${r.id}` })))),
  );
  if (user.role === "ADMIN") {
    tasks.push(
      prisma.user
        .findMany({ where: { OR: [{ fullName: like }, { email: like }] }, take, select: { id: true, fullName: true, email: true, role: true } })
        .then((rows) => rank("users", rows.map((r) => ({ id: r.id, title: r.fullName, subtitle: `${r.email} · ${r.role}`, href: `/app/users/${r.id}` })))),
    );
  }
  await Promise.all(tasks);
  return { query: q, total: Object.values(groups).reduce((s, g) => s + g.length, 0), groups };
}
