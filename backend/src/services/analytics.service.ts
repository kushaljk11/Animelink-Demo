// Dashboards & analytics: role-aware KPIs, ward statistics, public landing stats, sidebar badges, AI evaluation metrics.
import type { Role } from "@prisma/client";
import { prisma } from "../config/db";
import { env } from "../config/env";
import { hasRole, type SessionUser } from "./auth.service";
import { incidentScope } from "./rbac";
import { dailySeries, kpi, period, seriesFrom, tally, type Period } from "./stats";
import { summarizeVaccinations } from "./vaccination";

/** Role-aware dashboard payload: KPI cards with deltas + sparklines, zero-filled series, breakdowns. */
export async function overview(user: SessionUser, days: number, municipalityFilter?: string) {
  const p = period(days);
  const keys = dailySeries(p.from, days);
  const municipality = municipalityFilter ?? (user.role === "WARD_OFFICER" ? (user.municipality ?? undefined) : undefined);
  const role: Role = user.role;
  const body =
    role === "ADMIN" || role === "WARD_OFFICER"
      ? await monitoring(user, p, keys, municipality)
      : role === "VET_CLINIC"
        ? await clinic(user, p, keys)
        : role === "RESCUE_ORG"
          ? await rescue(user, p, keys, municipality)
          : await owner(user, p, keys);
  return { role, period: { from: p.from, to: p.to, days: p.days }, ...body };
}

type WardRow = { municipality: string; wardNumber: number | null; incidents: number; suspectedRabies: number; highSeverity: number; open: number; strays: number; sterilizedStrays: number; cnvrProcedures: number };

/** Ward-level counts (Section S). No coverage %: ward animal populations are unknown (Section V). */
export async function wardStats(user: SessionUser, days: number, municipalityFilter?: string) {
  const p = period(days);
  const municipality = municipalityFilter ?? (user.role === "WARD_OFFICER" ? (user.municipality ?? undefined) : undefined);
  const area = municipality ? { municipality } : {};
  const [incidents, strays, cnvr] = await Promise.all([
    prisma.biteIncident.findMany({ where: { AND: [incidentScope(user), area, { incidentDate: { gte: p.from, lte: p.to } }] }, select: { municipality: true, wardNumber: true, suspectedRabies: true, severity: true, status: true } }),
    prisma.communityStray.findMany({ where: area, select: { municipality: true, wardNumber: true, cnvrRecords: { select: { sterilizationDate: true } } } }),
    prisma.cnvrRecord.findMany({ where: { createdAt: { gte: p.from, lte: p.to }, ...(municipality ? { stray: { municipality } } : {}) }, select: { stray: { select: { municipality: true, wardNumber: true } } } }),
  ]);
  const rows = new Map<string, WardRow>();
  const get = (m: string | null, w: number | null) => {
    const k = `${m ?? "Unknown"}|${w ?? "-"}`;
    let r = rows.get(k);
    if (!r) rows.set(k, (r = { municipality: m ?? "Unknown", wardNumber: w, incidents: 0, suspectedRabies: 0, highSeverity: 0, open: 0, strays: 0, sterilizedStrays: 0, cnvrProcedures: 0 }));
    return r;
  };
  for (const i of incidents) {
    const r = get(i.municipality, i.wardNumber);
    r.incidents++;
    if (i.suspectedRabies) r.suspectedRabies++;
    if (i.severity === "HIGH") r.highSeverity++;
    if (i.status === "REPORTED" || i.status === "UNDER_REVIEW") r.open++;
  }
  for (const s of strays) {
    const r = get(s.municipality, s.wardNumber);
    r.strays++;
    if (s.cnvrRecords.some((c) => c.sterilizationDate)) r.sterilizedStrays++;
  }
  for (const c of cnvr) get(c.stray.municipality, c.stray.wardNumber).cnvrProcedures++;
  return {
    period: { from: p.from, to: p.to, days: p.days },
    municipality: municipality ?? null,
    wards: [...rows.values()].sort((a, b) => b.incidents - a.incidents || b.suspectedRabies - a.suspectedRabies),
  };
}

/** Aggregate counts for the public landing page (no personal data). */
export async function publicStats() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [clinics, shelters, lost, incidents, cnvr] = await Promise.all([
    prisma.veterinaryClinic.count({ where: { verificationStatus: "VERIFIED" } }),
    prisma.rescueOrganization.count({ where: { verificationStatus: "VERIFIED" } }),
    prisma.lostPetReport.count({ where: { status: "ACTIVE" } }),
    prisma.biteIncident.count({ where: { incidentDate: { gte: since }, status: { not: "DISMISSED" } } }),
    prisma.cnvrRecord.count({ where: { createdAt: { gte: since } } }),
  ]);
  return { verifiedClinics: clinics, verifiedShelters: shelters, activeLostPets: lost, incidentsLast30Days: incidents, cnvrLast30Days: cnvr };
}

/** Sidebar badge counts for the signed-in role. */
export async function navCounts(user: SessionUser) {
  const [openIncidents, pendingVaccinations, pendingVerifications, lostPets, overdueBoosters] = await Promise.all([
    hasRole(user, "WARD_OFFICER", "RESCUE_ORG") ? prisma.biteIncident.count({ where: { AND: [incidentScope(user), { status: { in: ["REPORTED", "UNDER_REVIEW"] } }] } }) : 0,
    user.role === "VET_CLINIC" && user.clinicId
      ? prisma.vaccinationRecord.count({ where: { vetId: user.clinicId, status: "PENDING_VERIFICATION" } })
      : user.role === "PET_OWNER"
        ? prisma.vaccinationRecord.count({ where: { pet: { ownerId: user.id }, status: "PENDING_VERIFICATION" } })
        : 0,
    user.role === "ADMIN"
      ? Promise.all([prisma.veterinaryClinic.count({ where: { verificationStatus: "PENDING" } }), prisma.rescueOrganization.count({ where: { verificationStatus: "PENDING" } })]).then(([a, b]) => a + b)
      : 0,
    user.role === "PET_OWNER" ? prisma.pet.count({ where: { ownerId: user.id, lostStatus: true } }) : 0,
    user.role === "PET_OWNER" ? prisma.vaccinationRecord.count({ where: { pet: { ownerId: user.id }, status: "VERIFIED", boosterDueDate: { lt: new Date() } } }) : 0,
  ]);
  const conversationScope =
    user.role === "PET_OWNER" ? { ownerId: user.id } : user.role === "VET_CLINIC" && user.clinicId ? { clinicId: user.clinicId } : null;
  const unreadMessages = conversationScope
    ? await prisma.chatMessage.count({ where: { readAt: null, senderId: { not: user.id }, conversation: conversationScope } })
    : 0;
  return { openIncidents, pendingVaccinations, pendingVerifications, lostPets, overdueBoosters, unreadMessages };
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

/** Section T.5 / Y.8 evaluation metrics for both AI features. */
export async function aiMetrics() {
  const [predictions, chats, intents] = await Promise.all([
    prisma.aiBreedPrediction.findMany({ select: { confidenceScore: true, ownerConfirmed: true, modelVersion: true, predictedBreed: true, finalBreed: true } }),
    prisma.chatbotLog.findMany({ select: { safetyEscalated: true, responseMs: true, helpful: true, intent: true, locale: true } }),
    prisma.chatbotLog.groupBy({ by: ["intent"], _count: { _all: true }, orderBy: { _count: { intent: "desc" } } }),
  ]);
  const answered = predictions.filter((p) => p.ownerConfirmed !== null);
  const confirmed = answered.filter((p) => p.ownerConfirmed).length;
  const bands = [0, 0.25, 0.5, 0.75, 1.01];
  const calibration = bands.slice(0, -1).map((lo, i) => {
    const hi = bands[i + 1]!;
    const inBand = answered.filter((p) => p.confidenceScore >= lo && p.confidenceScore < hi);
    return { range: `${lo.toFixed(2)}-${Math.min(hi, 1).toFixed(2)}`, count: inBand.length, accuracyPct: pct(inBand.filter((p) => p.ownerConfirmed).length, inBand.length) };
  });
  const corrections = new Map<string, number>();
  for (const p of answered.filter((x) => !x.ownerConfirmed && x.finalBreed)) {
    const k = `${p.predictedBreed} -> ${p.finalBreed}`;
    corrections.set(k, (corrections.get(k) ?? 0) + 1);
  }
  const rated = chats.filter((c) => c.helpful !== null);
  const ms = chats.map((c) => c.responseMs).sort((a, b) => a - b);
  return {
    breedFinder: {
      totalPredictions: predictions.length,
      answeredByOwner: answered.length,
      userConfirmationRatePct: pct(confirmed, answered.length),
      averageConfidence: predictions.length ? Math.round((predictions.reduce((s, p) => s + p.confidenceScore, 0) / predictions.length) * 1000) / 1000 : null,
      calibration,
      topCorrections: [...corrections.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([pair, count]) => ({ pair, count })),
      modelVersions: [...new Set(predictions.map((p) => p.modelVersion))],
    },
    chatbot: {
      totalQuestions: chats.length,
      safetyEscalations: chats.filter((c) => c.safetyEscalated).length,
      safetyEscalationRatePct: pct(chats.filter((c) => c.safetyEscalated).length, chats.length),
      fallbackRatePct: pct(chats.filter((c) => c.intent === "fallback").length, chats.length),
      helpfulRatePct: pct(rated.filter((c) => c.helpful).length, rated.length),
      ratedCount: rated.length,
      responseMs: { avg: ms.length ? Math.round(ms.reduce((s, v) => s + v, 0) / ms.length) : null, p95: ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] : null },
      byLocale: { EN: chats.filter((c) => c.locale === "EN").length, NE: chats.filter((c) => c.locale === "NE").length },
      byIntent: intents.map((i) => ({ intent: i.intent, count: i._count._all })),
    },
  };
}

// ------------------------------------------------------- per-role overview builders
async function monitoring(user: SessionUser, p: Period, keys: string[], municipality?: string) {
  const scope = { AND: [incidentScope(user), municipality ? { municipality } : {}] };
  const strayArea = municipality ? { stray: { municipality } } : {};
  const [incidents, prevIncidents, prevSuspected, cnvr, prevCnvr, vaccinations, prevVaccinations, lostActive, openIncidents] = await Promise.all([
    prisma.biteIncident.findMany({
      where: { ...scope, incidentDate: { gte: p.from, lte: p.to } },
      select: { incidentDate: true, suspectedRabies: true, severity: true, status: true, animalType: true, wardNumber: true, municipality: true },
    }),
    prisma.biteIncident.count({ where: { ...scope, incidentDate: { gte: p.prevFrom, lt: p.from } } }),
    prisma.biteIncident.count({ where: { ...scope, suspectedRabies: true, incidentDate: { gte: p.prevFrom, lt: p.from } } }),
    prisma.cnvrRecord.findMany({ where: { ...strayArea, createdAt: { gte: p.from, lte: p.to } }, select: { createdAt: true, sterilizationDate: true, vaccinationDate: true } }),
    prisma.cnvrRecord.count({ where: { ...strayArea, createdAt: { gte: p.prevFrom, lt: p.from } } }),
    prisma.vaccinationRecord.findMany({ where: { status: "VERIFIED", verifiedAt: { gte: p.from, lte: p.to } }, select: { verifiedAt: true } }),
    prisma.vaccinationRecord.count({ where: { status: "VERIFIED", verifiedAt: { gte: p.prevFrom, lt: p.from } } }),
    prisma.lostPetReport.count({ where: { status: "ACTIVE" } }),
    prisma.biteIncident.count({ where: { ...scope, status: { in: ["REPORTED", "UNDER_REVIEW"] } } }),
  ]);
  const suspected = incidents.filter((i) => i.suspectedRabies);
  const sterilized = cnvr.filter((c) => c.sterilizationDate);

  return {
    scope: { municipality: municipality ?? "All municipalities" },
    kpis: [
      kpi("incidents", "Bite incidents reported", incidents.map((i) => i.incidentDate), prevIncidents, keys, false),
      kpi("suspected", "Suspected rabies reports", suspected.map((i) => i.incidentDate), prevSuspected, keys, false),
      kpi("cnvr", "CNVR procedures", cnvr.map((c) => c.createdAt), prevCnvr, keys, true),
      kpi("vaccinations", "Pet vaccinations verified", vaccinations.map((v) => v.verifiedAt!), prevVaccinations, keys, true),
      { ...kpi("open", "Open incidents", [], null, keys, false, openIncidents), sparkline: [] },
      { ...kpi("lost", "Active lost pets", [], null, keys, false, lostActive), sparkline: [] },
    ],
    series: seriesFrom(keys, {
      incidents: incidents.map((x) => x.incidentDate),
      suspected: suspected.map((x) => x.incidentDate),
      cnvr: cnvr.map((x) => x.createdAt),
      sterilizations: sterilized.map((x) => x.createdAt),
      vaccinations: vaccinations.map((x) => x.verifiedAt!),
    }),
    breakdowns: {
      incidentsBySeverity: tally(incidents, (i) => i.severity),
      incidentsByStatus: tally(incidents, (i) => i.status),
      incidentsByAnimal: tally(incidents, (i) => i.animalType),
      incidentsByWard: tally(incidents, (i) => (i.wardNumber ? `${i.municipality ?? ""} - Ward ${i.wardNumber}` : null)).slice(0, 10),
    },
  };
}

async function clinic(user: SessionUser, p: Period, keys: string[]) {
  if (!user.clinicId) return { kpis: [], series: [], breakdowns: {}, notice: "No clinic profile linked to this account." };
  const where = { vetId: user.clinicId };
  const soon = new Date(Date.now() + env.dueSoonDays * 86_400_000);
  const [recent, prev, pending, petsServed, dueSoon, overdue] = await Promise.all([
    prisma.vaccinationRecord.findMany({ where: { ...where, administeredDate: { gte: p.from, lte: p.to } }, select: { administeredDate: true, vaccineName: true, status: true } }),
    prisma.vaccinationRecord.count({ where: { ...where, administeredDate: { gte: p.prevFrom, lt: p.from } } }),
    prisma.vaccinationRecord.count({ where: { ...where, status: "PENDING_VERIFICATION" } }),
    prisma.vaccinationRecord.groupBy({ by: ["petId"], where }).then((g) => g.length),
    prisma.vaccinationRecord.count({ where: { ...where, status: "VERIFIED", boosterDueDate: { gte: new Date(), lte: soon } } }),
    prisma.vaccinationRecord.count({ where: { ...where, status: "VERIFIED", boosterDueDate: { lt: new Date() } } }),
  ]);
  return {
    kpis: [
      kpi("vaccinations", "Vaccinations administered", recent.map((r) => r.administeredDate), prev, keys, true),
      { ...kpi("pending", "Awaiting verification", [], null, keys, false, pending), sparkline: [] },
      { ...kpi("patients", "Pets served (all time)", [], null, keys, true, petsServed), sparkline: [] },
      { ...kpi("dueSoon", "Boosters due soon", [], null, keys, false, dueSoon), sparkline: [] },
      { ...kpi("overdue", "Boosters overdue", [], null, keys, false, overdue), sparkline: [] },
    ],
    series: seriesFrom(keys, { vaccinations: recent.map((r) => r.administeredDate) }),
    breakdowns: { byVaccine: tally(recent, (r) => r.vaccineName), byStatus: tally(recent, (r) => r.status) },
  };
}

async function rescue(user: SessionUser, p: Period, keys: string[], municipality?: string) {
  const orgWhere = user.organizationId ? { organizationId: user.organizationId } : {};
  const [strays, prevStrays, cnvr, prevCnvr, totalStrays, sterilizedAll] = await Promise.all([
    prisma.communityStray.findMany({ where: { createdAt: { gte: p.from, lte: p.to }, ...(municipality ? { municipality } : {}) }, select: { createdAt: true, gender: true, municipality: true } }),
    prisma.communityStray.count({ where: { createdAt: { gte: p.prevFrom, lt: p.from } } }),
    prisma.cnvrRecord.findMany({ where: { ...orgWhere, createdAt: { gte: p.from, lte: p.to } }, select: { createdAt: true, sterilizationDate: true, vaccinationDate: true, releaseDate: true } }),
    prisma.cnvrRecord.count({ where: { ...orgWhere, createdAt: { gte: p.prevFrom, lt: p.from } } }),
    prisma.communityStray.count(),
    prisma.communityStray.count({ where: { cnvrRecords: { some: { sterilizationDate: { not: null } } } } }),
  ]);
  const ster = cnvr.filter((c) => c.sterilizationDate);
  const vacc = cnvr.filter((c) => c.vaccinationDate);
  return {
    kpis: [
      kpi("strays", "Strays registered", strays.map((s) => s.createdAt), prevStrays, keys, true),
      kpi("cnvr", user.organizationId ? "Your CNVR procedures" : "CNVR procedures", cnvr.map((c) => c.createdAt), prevCnvr, keys, true),
      kpi("sterilizations", "Sterilisations", ster.map((c) => c.createdAt), null, keys, true),
      kpi("strayVaccinations", "Stray vaccinations", vacc.map((c) => c.createdAt), null, keys, true),
      // Share of *registered* strays only — the true population is unknown (Section V).
      { ...kpi("registeredSterilized", "Registered strays sterilised", [], null, keys, true, sterilizedAll), sparkline: [], of: totalStrays },
    ],
    series: seriesFrom(keys, {
      strays: strays.map((s) => s.createdAt),
      sterilizations: ster.map((c) => c.createdAt),
      vaccinations: vacc.map((c) => c.createdAt),
    }),
    breakdowns: { straysByGender: tally(strays, (s) => s.gender), straysByMunicipality: tally(strays, (s) => s.municipality) },
  };
}

async function owner(user: SessionUser, p: Period, keys: string[]) {
  const [pets, unread, myIncidents, scans] = await Promise.all([
    prisma.pet.findMany({
      where: { ownerId: user.id },
      select: { id: true, name: true, lostStatus: true, vaccinationRecords: { select: { id: true, vaccineName: true, administeredDate: true, boosterDueDate: true, status: true } } },
    }),
    prisma.notification.count({ where: { userId: user.id, status: "SENT", readAt: null } }),
    prisma.biteIncident.count({ where: { reportedById: user.id } }),
    prisma.qrScanEvent.findMany({ where: { pet: { ownerId: user.id }, scannedAt: { gte: p.from } }, select: { scannedAt: true } }),
  ]);
  const summaries = pets.map((pet) => ({ id: pet.id, name: pet.name, lost: pet.lostStatus, ...summarizeVaccinations(pet.vaccinationRecords) }));
  const nextDue = summaries
    .filter((s) => s.nextDue)
    .sort((a, b) => a.nextDue!.getTime() - b.nextDue!.getTime())[0];
  return {
    kpis: [
      { ...kpi("pets", "Registered pets", [], null, keys, true, pets.length), sparkline: [] },
      { ...kpi("attention", "Pets needing a booster", [], null, keys, false, summaries.filter((s) => s.status === "OVERDUE" || s.status === "DUE_SOON").length), sparkline: [] },
      { ...kpi("lost", "Pets marked lost", [], null, keys, false, summaries.filter((s) => s.lost).length), sparkline: [] },
      kpi("scans", "QR tag scans", scans.map((s) => s.scannedAt), null, keys, true),
      { ...kpi("unread", "Unread notifications", [], null, keys, false, unread), sparkline: [] },
      { ...kpi("reports", "Incidents you reported", [], null, keys, true, myIncidents), sparkline: [] },
    ],
    series: seriesFrom(keys, { scans: scans.map((s) => s.scannedAt) }),
    breakdowns: { petsByStatus: tally(summaries, (s) => s.status) },
    nextDue: nextDue ? { petId: nextDue.id, petName: nextDue.name, date: nextDue.nextDue } : null,
    pets: summaries.map((s) => ({ id: s.id, name: s.name, status: s.status, lost: s.lost, nextDue: s.nextDue })),
  };
}
