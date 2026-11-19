// Pets, lost-pet mode, QR identity and certificates (Sections H.2, H.4, H.7, H.8, N.1–N.2).
import { createHash } from "node:crypto";
import { LostReportStatus, Species, type Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../config/db";
import { boolParam, conflict, dateRange, enumFilter, forbidden, frontendOrigin, notFound, paginated, type ListParams } from "../utils/http";
import type { lostReportUpdateSchema, markLostSchema, petCreateSchema, petMedicalUpdateSchema, petUpdateSchema, qrScanSchema } from "../validators";
import { hasRole, type SessionUser } from "./auth.service";
import { coarsen } from "./geo";
import { notify } from "./notify";
import { vaccinationCertificatePdf } from "./pdf";
import { newQrToken, publicPetPath, qrPng, qrSvg } from "./qr";
import { assertPetOwnerOrAdmin, petScope } from "./rbac";
import { petListInclude, publicPetInclude, publicPetProfile, withVaccinationSummary } from "./serializers";
import { deleteUpload } from "./uploads";
import { summarizeVaccinations } from "./vaccination";

const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

export async function listPets(user: SessionUser, p: ListParams) {
  const species = enumFilter(p.sp.get("species")?.split(","), Species, "species");
  const lost = boolParam(p.sp, "lost");
  const ownerId = p.sp.get("ownerId");
  const where: Prisma.PetWhereInput = {
    AND: [
      petScope(user),
      species ? { species: { in: species } } : {},
      lost !== undefined ? { lostStatus: lost } : {},
      ownerId && user.role !== "PET_OWNER" ? { ownerId } : {},
      p.query
        ? {
            OR: [
              { name: ci(p.query) },
              { breed: ci(p.query) },
              { color: ci(p.query) },
              { qrToken: p.query },
              ...(user.role !== "PET_OWNER" ? [{ owner: { fullName: ci(p.query) } }, { owner: { phone: ci(p.query) } }] : []),
            ],
          }
        : {},
      dateRange("createdAt", p.from, p.to),
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.pet.findMany({ where, orderBy: p.orderBy, skip: p.skip, take: p.take, include: petListInclude }),
    prisma.pet.count({ where }),
  ]);
  return paginated(rows.map(withVaccinationSummary), total, p);
}

export async function createPet(user: SessionUser, input: z.output<typeof petCreateSchema>) {
  const { breedPredictionId, ...body } = input;
  const pet = await prisma.$transaction(async (tx) => {
    const created = await tx.pet.create({ data: { ...body, ownerId: user.id, qrToken: newQrToken() }, include: petListInclude });
    if (breedPredictionId) {
      await tx.aiBreedPrediction.updateMany({ where: { id: breedPredictionId, petId: null }, data: { petId: created.id, finalBreed: body.breed ?? undefined } });
    }
    return created;
  });
  return withVaccinationSummary(pet);
}

async function scopedPet(user: SessionUser, id: string) {
  const pet = await prisma.pet.findFirst({ where: { AND: [{ id }, petScope(user)] } });
  if (!pet) throw notFound("Pet");
  return pet;
}

export async function getPet(user: SessionUser, id: string) {
  const ownerView = user.role === "PET_OWNER" || user.role === "ADMIN";
  const pet = await prisma.pet.findFirst({
    where: { AND: [{ id }, petScope(user)] },
    include: {
      owner: { select: { id: true, fullName: true, phone: true, email: true, municipality: true, wardNumber: true } },
      vaccinationRecords: { orderBy: { administeredDate: "desc" }, include: { clinic: { select: { id: true, clinicName: true, registrationNumber: true, phone: true } } } },
      lostPetReports: { orderBy: { createdAt: "desc" }, take: 10 },
      qrScanEvents: ownerView ? { orderBy: { scannedAt: "desc" }, take: 20 } : false, // finder locations: owner/admin only
      breedPredictions: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!pet) throw notFound("Pet");
  return { ...pet, vaccination: summarizeVaccinations(pet.vaccinationRecords) };
}

/** Owners edit the full profile; vets may update medical notes only (K.2). */
export async function updatePet(user: SessionUser, id: string, raw: unknown, schemas: { owner: typeof petUpdateSchema; medical: typeof petMedicalUpdateSchema }) {
  const pet = await scopedPet(user, id);
  if (user.role === "VET_CLINIC") {
    const body = schemas.medical.parse(raw ?? {});
    return { before: { medicalNotes: pet.medicalNotes }, after: body, pet: await prisma.pet.update({ where: { id }, data: body }) };
  }
  if (user.role !== "ADMIN" && pet.ownerId !== user.id) throw forbidden("Only the pet's owner can edit this profile");
  const body = schemas.owner.parse(raw ?? {});
  const updated = await prisma.pet.update({ where: { id }, data: body });
  if (body.photoUrl !== undefined && pet.photoUrl && body.photoUrl !== pet.photoUrl) await deleteUpload(pet.photoUrl);
  return { before: pet, after: body, pet: updated };
}

export async function deletePet(user: SessionUser, id: string) {
  const pet = await scopedPet(user, id);
  assertPetOwnerOrAdmin(user, pet);
  const verified = await prisma.vaccinationRecord.count({ where: { petId: id, status: "VERIFIED" } });
  await prisma.pet.delete({ where: { id } });
  await deleteUpload(pet.photoUrl);
  return { pet, verified };
}

export async function markLost(user: SessionUser, id: string, body: z.output<typeof markLostSchema>) {
  const pet = await prisma.pet.findUnique({ where: { id } });
  if (!pet) throw notFound("Pet");
  assertPetOwnerOrAdmin(user, pet);
  if (pet.lostStatus) throw conflict("This pet is already marked as lost");
  return prisma.$transaction(async (tx) => {
    await tx.pet.update({ where: { id }, data: { lostStatus: true } });
    return tx.lostPetReport.create({
      data: {
        petId: id,
        lastSeenDate: body.lastSeenDate,
        lastSeenLatitude: body.lastSeenLatitude ?? null,
        lastSeenLongitude: body.lastSeenLongitude ?? null,
        description: body.description ?? null,
      },
    });
  });
}

export async function markFound(user: SessionUser, id: string, note: string | null | undefined) {
  const pet = await prisma.pet.findUnique({ where: { id } });
  if (!pet) throw notFound("Pet");
  assertPetOwnerOrAdmin(user, pet);
  if (!pet.lostStatus) throw conflict("This pet is not marked as lost");
  const now = new Date();
  const resolved = await prisma.$transaction(async (tx) => {
    await tx.pet.update({ where: { id }, data: { lostStatus: false } });
    const active = await tx.lostPetReport.findMany({ where: { petId: id, status: "ACTIVE" } });
    for (const r of active) {
      await tx.lostPetReport.update({
        where: { id: r.id },
        data: { status: "FOUND", resolvedAt: now, description: note ? [r.description, `Found: ${note}`].filter(Boolean).join("\n") : r.description },
      });
    }
    return active.length;
  });
  return { petId: id, lostStatus: false, reportsResolved: resolved };
}

export async function qrImage(user: SessionUser, id: string, format: "png" | "svg", size: number) {
  const pet = await scopedPet(user, id);
  const url = `${frontendOrigin()}${publicPetPath(pet.qrToken)}`;
  const filename = `${pet.name.replace(/[^\w-]+/g, "_")}-qr.${format}`;
  return { url, filename, body: format === "svg" ? await qrSvg(url) : await qrPng(url, size) };
}

export async function certificate(user: SessionUser, id: string) {
  const pet = await prisma.pet.findFirst({
    where: { AND: [{ id }, petScope(user)] },
    include: {
      owner: { select: { fullName: true, municipality: true, wardNumber: true } },
      vaccinationRecords: { orderBy: { administeredDate: "desc" }, include: { clinic: { select: { clinicName: true, registrationNumber: true } } } },
    },
  });
  if (!pet) throw notFound("Pet");
  const verified = pet.vaccinationRecords.filter((r) => r.status === "VERIFIED");
  const issuedAt = new Date();
  const verifyUrl = `${frontendOrigin()}${publicPetPath(pet.qrToken)}`;
  // Certificate number fingerprints the exact verified record set it was issued for.
  const fingerprint = createHash("sha256")
    .update(pet.id + verified.map((r) => `${r.id}:${r.verifiedAt?.toISOString()}`).join("|"))
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
  const pdf = await vaccinationCertificatePdf({
    certificateNo: `RTN-${issuedAt.getUTCFullYear()}-${fingerprint}`,
    issuedAt,
    verifyUrl,
    qrPng: await qrPng(verifyUrl, 300),
    pet,
    owner: pet.owner,
    status: summarizeVaccinations(pet.vaccinationRecords).status,
    records: verified.map((r) => ({
      vaccineName: r.vaccineName,
      batchNumber: r.batchNumber,
      administeredDate: r.administeredDate,
      boosterDueDate: r.boosterDueDate,
      clinicName: r.clinic.clinicName,
      registrationNumber: r.clinic.registrationNumber,
      verifiedAt: r.verifiedAt,
    })),
  });
  return { pdf, filename: `vaccination-certificate-${pet.name.replace(/[^\w-]+/g, "_")}.pdf` };
}

// ---------------------------------------------------------------- public QR

export async function publicProfile(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw notFound("Pet");
  const pet = await prisma.pet.findUnique({ where: { qrToken: token }, include: publicPetInclude });
  if (!pet) throw notFound("Pet");
  return publicPetProfile(pet);
}

/** Coarse device family only — never the full user agent (R.10 "only necessary data"). */
function deviceFamily(ua: string | undefined): string {
  if (!ua) return "unknown";
  const os = /android/i.test(ua) ? "Android" : /iphone|ipad|ios/i.test(ua) ? "iOS" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "Other";
  const browser = /edg\//i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "Other";
  return `${os} / ${browser}`;
}

/** A finder reports a scan, optionally sharing location, a message and a contact (N.2, L.13–14). */
export async function recordScan(token: string, body: z.output<typeof qrScanSchema>, userAgent: string | undefined) {
  const pet = await prisma.pet.findUnique({ where: { qrToken: token }, select: { id: true, name: true, ownerId: true, lostStatus: true } });
  if (!pet) throw notFound("Pet");
  const event = await prisma.qrScanEvent.create({
    data: {
      petId: pet.id,
      locationPermission: body.shareLocation,
      sharedLatitude: body.shareLocation ? body.latitude! : null,
      sharedLongitude: body.shareLocation ? body.longitude! : null,
      finderMessage: body.message ?? null,
      finderContact: body.contact ?? null,
      deviceOrSessionInfo: deviceFamily(userAgent),
    },
  });
  await notify({
    userId: pet.ownerId,
    type: "LOST_PET_SCAN",
    title: pet.lostStatus ? `Someone may have found ${pet.name}!` : `${pet.name}'s QR tag was scanned`,
    message: [
      body.shareLocation ? "They shared the location where the pet is." : "No location was shared.",
      body.message ? `Message: "${body.message}"` : null,
      body.contact ? `Finder contact: ${body.contact}` : null,
    ]
      .filter(Boolean)
      .join(" "),
    link: `/app/pets/${pet.id}?tab=scans`,
  });
  return {
    scanId: event.id,
    message: pet.lostStatus ? "Thank you! The owner has been notified." : "Thank you. The owner has been notified that their pet's tag was scanned.",
  };
}

// ------------------------------------------------------------- lost reports

/** Public: active lost pets with approximate location. ?mine=true or officers: full records. */
export async function listLostReports(user: SessionUser | null, p: ListParams) {
  const mine = boolParam(p.sp, "mine");
  const privileged = !!user && (!!mine || hasRole(user, "WARD_OFFICER"));
  const statuses = privileged ? enumFilter(p.status, LostReportStatus) : (["ACTIVE"] as LostReportStatus[]);
  const where: Prisma.LostPetReportWhereInput = {
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(privileged && mine ? { pet: { ownerId: user!.id } } : {}),
    ...dateRange("lastSeenDate", p.from, p.to),
    ...(p.query ? { OR: [{ pet: { name: ci(p.query) } }, { pet: { breed: ci(p.query) } }, { description: ci(p.query) }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.lostPetReport.findMany({
      where,
      orderBy: p.orderBy,
      skip: p.skip,
      take: p.take,
      include: {
        pet: {
          select: {
            id: true, name: true, species: true, breed: true, color: true, gender: true, photoUrl: true, qrToken: true, ownerId: true,
            owner: { select: { municipality: true, wardNumber: true } },
            _count: { select: { qrScanEvents: true } },
          },
        },
      },
    }),
    prisma.lostPetReport.count({ where }),
  ]);
  const data = rows.map((r) => {
    if (privileged) return r;
    const loc = r.lastSeenLatitude != null && r.lastSeenLongitude != null ? coarsen({ lat: r.lastSeenLatitude, lng: r.lastSeenLongitude }, 3) : null;
    return {
      id: r.id,
      status: r.status,
      lastSeenDate: r.lastSeenDate,
      lastSeenApprox: loc,
      description: r.description,
      createdAt: r.createdAt,
      area: { municipality: r.pet.owner.municipality, wardNumber: r.pet.owner.wardNumber },
      pet: { name: r.pet.name, species: r.pet.species, breed: r.pet.breed, color: r.pet.color, gender: r.pet.gender, photoUrl: r.pet.photoUrl, profilePath: publicPetPath(r.pet.qrToken) },
    };
  });
  return paginated(data, total, p);
}

export async function getLostReport(user: SessionUser, id: string) {
  const report = await prisma.lostPetReport.findUnique({
    where: { id },
    include: { pet: { include: { qrScanEvents: { orderBy: { scannedAt: "desc" }, take: 50 }, owner: { select: { id: true, fullName: true, phone: true } } } } },
  });
  if (!report) throw notFound("Lost report");
  if (!hasRole(user, "WARD_OFFICER")) assertPetOwnerOrAdmin(user, report.pet);
  return report;
}

export async function updateLostReport(user: SessionUser, id: string, body: z.output<typeof lostReportUpdateSchema>) {
  const report = await prisma.lostPetReport.findUnique({ where: { id }, include: { pet: true } });
  if (!report) throw notFound("Lost report");
  assertPetOwnerOrAdmin(user, report.pet);
  const closing = !!body.status && body.status !== "ACTIVE" && report.status === "ACTIVE";
  const reopening = body.status === "ACTIVE" && report.status !== "ACTIVE";
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.lostPetReport.update({
      where: { id },
      data: { ...body, ...(closing ? { resolvedAt: new Date() } : {}), ...(reopening ? { resolvedAt: null } : {}) },
    });
    const stillActive = await tx.lostPetReport.count({ where: { petId: report.petId, status: "ACTIVE" } });
    await tx.pet.update({ where: { id: report.petId }, data: { lostStatus: stillActive > 0 } });
    return r;
  });
  return { report, updated, closing, reopening };
}

export async function listQrScans(user: SessionUser, p: ListParams) {
  if (user.role !== "PET_OWNER" && user.role !== "ADMIN") throw forbidden("Only pet owners can view scan history");
  const petId = p.sp.get("petId");
  const withLocation = boolParam(p.sp, "withLocation");
  const where: Prisma.QrScanEventWhereInput = {
    ...(user.role === "PET_OWNER" ? { pet: { ownerId: user.id } } : {}),
    ...(petId ? { petId } : {}),
    ...(withLocation ? { locationPermission: true } : {}),
    ...dateRange("scannedAt", p.from, p.to),
  };
  const [rows, total] = await Promise.all([
    prisma.qrScanEvent.findMany({ where, orderBy: p.orderBy, skip: p.skip, take: p.take, include: { pet: { select: { id: true, name: true, lostStatus: true, photoUrl: true } } } }),
    prisma.qrScanEvent.count({ where }),
  ]);
  return paginated(rows, total, p);
}
