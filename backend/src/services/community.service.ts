// Community strays & CNVR (Sections H.9–H.10, H.18, N.3).
import { Gender, Species, type Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../config/db";
import { ApiError, boolParam, conflict, dateRange, enumFilter, forbidden, intParam, notFound, paginated, type ListParams } from "../utils/http";
import type { cnvrCreateSchema, cnvrUpdateSchema, duplicateCheckSchema, strayCreateSchema, strayUpdateSchema } from "../validators";
import { requireVerifiedOrganization, type SessionUser } from "./auth.service";
import { findDuplicateCandidates } from "./duplicates";
import { deleteUpload } from "./uploads";

const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

export async function listStrays(user: SessionUser, p: ListParams) {
  const species = enumFilter(p.sp.get("species")?.split(","), Species, "species");
  const genders = enumFilter(p.sp.get("gender")?.split(","), Gender, "gender");
  const sterilized = boolParam(p.sp, "sterilized");
  const vaccinated = boolParam(p.sp, "vaccinated");
  const ward = intParam(p.sp, "wardNumber");
  const municipality = p.sp.get("municipality");
  const mine = boolParam(p.sp, "mine");
  const where: Prisma.CommunityStrayWhereInput = {
    AND: [
      species ? { species: { in: species } } : {},
      genders ? { gender: { in: genders } } : {},
      municipality ? { municipality } : {},
      ward ? { wardNumber: ward } : {},
      mine ? { registeredById: user.id } : {},
      sterilized === true ? { cnvrRecords: { some: { sterilizationDate: { not: null } } } } : {},
      sterilized === false ? { cnvrRecords: { none: { sterilizationDate: { not: null } } } } : {},
      vaccinated === true ? { cnvrRecords: { some: { vaccinationDate: { not: null } } } } : {},
      vaccinated === false ? { cnvrRecords: { none: { vaccinationDate: { not: null } } } } : {},
      dateRange("createdAt", p.from, p.to),
      p.query
        ? { OR: [{ tagOrEarMark: ci(p.query) }, { color: ci(p.query) }, { breed: ci(p.query) }, { address: ci(p.query) }, { physicalDescription: ci(p.query) }] }
        : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.communityStray.findMany({
      where,
      orderBy: p.orderBy,
      skip: p.skip,
      take: p.take,
      include: {
        registeredBy: { select: { id: true, fullName: true, rescueOrganization: { select: { organizationName: true } } } },
        cnvrRecords: { orderBy: { createdAt: "desc" }, select: { id: true, vaccinationDate: true, sterilizationDate: true, releaseDate: true, createdAt: true } },
      },
    }),
    prisma.communityStray.count({ where }),
  ]);
  const data = rows.map(({ cnvrRecords, ...s }) => ({
    ...s,
    cnvr: {
      count: cnvrRecords.length,
      sterilized: cnvrRecords.some((c) => c.sterilizationDate),
      vaccinated: cnvrRecords.some((c) => c.vaccinationDate),
      lastVaccinationDate: cnvrRecords.find((c) => c.vaccinationDate)?.vaccinationDate ?? null,
      lastActivityAt: cnvrRecords[0]?.createdAt ?? null,
    },
  }));
  return paginated(data, total, p);
}

/**
 * Registers a community animal after the duplicate check. LIKELY matches block
 * creation with 409 until the user reviews them and sets acknowledgeDuplicates.
 */
export async function createStray(user: SessionUser, input: z.output<typeof strayCreateSchema>) {
  const { acknowledgeDuplicates, ...body } = input;
  const candidates = await findDuplicateCandidates(body);
  if (candidates.some((c) => c.likelihood === "LIKELY") && !acknowledgeDuplicates) {
    throw new ApiError(409, "This animal may already be registered. Review the candidates or resubmit with acknowledgeDuplicates=true.", "POSSIBLE_DUPLICATE", { candidates });
  }
  const stray = await prisma.communityStray.create({ data: { ...body, registeredById: user.id } });
  return { stray, duplicateCandidates: candidates };
}

export async function getStray(id: string) {
  const stray = await prisma.communityStray.findUnique({
    where: { id },
    include: {
      registeredBy: { select: { id: true, fullName: true, rescueOrganization: { select: { id: true, organizationName: true } } } },
      cnvrRecords: { orderBy: { createdAt: "desc" }, include: { organization: { select: { id: true, organizationName: true, phone: true } } } },
    },
  });
  if (!stray) throw notFound("Stray");
  return stray;
}

export async function updateStray(id: string, body: z.output<typeof strayUpdateSchema>) {
  const stray = await prisma.communityStray.findUnique({ where: { id } });
  if (!stray) throw notFound("Stray");
  const updated = await prisma.communityStray.update({ where: { id }, data: body });
  if (body.photoUrl !== undefined && stray.photoUrl && body.photoUrl !== stray.photoUrl) await deleteUpload(stray.photoUrl);
  return { before: stray, updated };
}

/** Only the registering user (or admin) may delete, and only before any CNVR history exists. */
export async function deleteStray(user: SessionUser, id: string) {
  const stray = await prisma.communityStray.findUnique({ where: { id }, include: { _count: { select: { cnvrRecords: true } } } });
  if (!stray) throw notFound("Stray");
  if (user.role !== "ADMIN" && stray.registeredById !== user.id) throw forbidden("Only the registering organisation can delete this record");
  if (stray._count.cnvrRecords > 0) throw conflict("This animal has CNVR history and cannot be deleted");
  await prisma.communityStray.delete({ where: { id } });
  await deleteUpload(stray.photoUrl);
  return stray;
}

export async function checkDuplicates(body: z.output<typeof duplicateCheckSchema>) {
  const candidates = await findDuplicateCandidates(body);
  return {
    candidates,
    summary: { likely: candidates.filter((c) => c.likelihood === "LIKELY").length, possible: candidates.filter((c) => c.likelihood === "POSSIBLE").length, radiusKm: body.radiusKm },
    note: "Matches are suggestions for human review; records are never merged automatically.",
  };
}

// --------------------------------------------------------------------- CNVR

export async function listCnvr(user: SessionUser, p: ListParams) {
  const sterilized = boolParam(p.sp, "sterilized");
  const vaccinated = boolParam(p.sp, "vaccinated");
  const released = boolParam(p.sp, "released");
  const mine = boolParam(p.sp, "mine");
  const strayId = p.sp.get("strayId");
  const organizationId = p.sp.get("organizationId");
  const municipality = p.sp.get("municipality");
  const where: Prisma.CnvrRecordWhereInput = {
    AND: [
      strayId ? { strayId } : {},
      organizationId ? { organizationId } : {},
      mine && user.organizationId ? { organizationId: user.organizationId } : {},
      municipality ? { stray: { municipality } } : {},
      sterilized !== undefined ? { sterilizationDate: sterilized ? { not: null } : null } : {},
      vaccinated !== undefined ? { vaccinationDate: vaccinated ? { not: null } : null } : {},
      released !== undefined ? { releaseDate: released ? { not: null } : null } : {},
      dateRange("createdAt", p.from, p.to),
      p.query
        ? { OR: [{ notes: ci(p.query) }, { vaccineName: ci(p.query) }, { stray: { tagOrEarMark: ci(p.query) } }, { organization: { organizationName: ci(p.query) } }] }
        : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.cnvrRecord.findMany({
      where,
      orderBy: p.orderBy,
      skip: p.skip,
      take: p.take,
      include: {
        stray: { select: { id: true, tagOrEarMark: true, color: true, gender: true, photoUrl: true, latitude: true, longitude: true, municipality: true, wardNumber: true } },
        organization: { select: { id: true, organizationName: true } },
      },
    }),
    prisma.cnvrRecord.count({ where }),
  ]);
  return paginated(rows, total, p);
}

export async function createCnvr(user: SessionUser, body: z.output<typeof cnvrCreateSchema>) {
  const organizationId = requireVerifiedOrganization(user);
  const stray = await prisma.communityStray.findUnique({ where: { id: body.strayId }, select: { id: true } });
  if (!stray) throw notFound("Stray");
  return prisma.cnvrRecord.create({
    data: { ...body, organizationId },
    include: { stray: { select: { id: true, tagOrEarMark: true } }, organization: { select: { organizationName: true } } },
  });
}

export async function getCnvr(id: string) {
  const record = await prisma.cnvrRecord.findUnique({ where: { id }, include: { stray: true, organization: { select: { id: true, organizationName: true, phone: true } } } });
  if (!record) throw notFound("CNVR record");
  return record;
}

async function ownCnvr(user: SessionUser, id: string) {
  const record = await prisma.cnvrRecord.findUnique({ where: { id } });
  if (!record) throw notFound("CNVR record");
  if (user.role !== "ADMIN" && (user.role !== "RESCUE_ORG" || user.organizationId !== record.organizationId)) {
    throw forbidden("Only the organisation that recorded this CNVR activity can change it");
  }
  return record;
}

export async function updateCnvr(user: SessionUser, id: string, body: z.output<typeof cnvrUpdateSchema>) {
  const before = await ownCnvr(user, id);
  return { before, updated: await prisma.cnvrRecord.update({ where: { id }, data: body }) };
}

export async function deleteCnvr(user: SessionUser, id: string) {
  const record = await ownCnvr(user, id);
  await prisma.cnvrRecord.delete({ where: { id } });
  return record;
}
