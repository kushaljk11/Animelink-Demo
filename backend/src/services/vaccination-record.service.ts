// Vaccination records lifecycle: PENDING_VERIFICATION → VERIFIED → REVOKED (Sections H.5, L.7–L.9, U).
import { VaccinationRecordStatus, type Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../config/db";
import { env } from "../config/env";
import { badRequest, boolParam, conflict, dateRange, enumFilter, forbidden, notFound, paginated, type ListParams } from "../utils/http";
import type { vaccinationCreateSchema, vaccinationDecisionSchema, vaccinationUpdateSchema } from "../validators";
import { requireVerifiedClinic, type SessionUser } from "./auth.service";
import { notify } from "./notify";
import { vaccinationScope } from "./rbac";
import { boosterStatus } from "./vaccination";

const BOOSTER_FILTERS = ["UP_TO_DATE", "DUE_SOON", "OVERDUE", "NO_BOOSTER"] as const;
const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

/** Booster status is derived from dates, so the filter becomes a date-range query. */
function boosterWhere(values: string[], now: Date): Prisma.VaccinationRecordWhereInput {
  const soon = new Date(now.getTime() + env.dueSoonDays * 86_400_000);
  return {
    OR: values.map((v): Prisma.VaccinationRecordWhereInput => {
      if (v === "OVERDUE") return { boosterDueDate: { lt: now } };
      if (v === "DUE_SOON") return { boosterDueDate: { gte: now, lte: soon } };
      if (v === "UP_TO_DATE") return { boosterDueDate: { gt: soon } };
      if (v === "NO_BOOSTER") return { boosterDueDate: null };
      throw badRequest(`Unknown boosterStatus "${v}". Allowed: ${BOOSTER_FILTERS.join(", ")}`);
    }),
  };
}

export async function listVaccinations(user: SessionUser, p: ListParams) {
  const now = new Date();
  const statuses = enumFilter(p.status, VaccinationRecordStatus);
  const booster = p.sp.get("boosterStatus")?.split(",").filter(Boolean);
  const mineClinic = boolParam(p.sp, "mine");
  const petId = p.sp.get("petId");
  const clinicId = p.sp.get("clinicId");
  const where: Prisma.VaccinationRecordWhereInput = {
    AND: [
      vaccinationScope(user),
      statuses ? { status: { in: statuses } } : {},
      booster?.length ? boosterWhere(booster, now) : {},
      petId ? { petId } : {},
      clinicId ? { vetId: clinicId } : {},
      mineClinic && user.clinicId ? { vetId: user.clinicId } : {},
      dateRange("administeredDate", p.from, p.to),
      p.query
        ? { OR: [{ vaccineName: ci(p.query) }, { batchNumber: ci(p.query) }, { pet: { name: ci(p.query) } }, { clinic: { clinicName: ci(p.query) } }] }
        : {},
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.vaccinationRecord.findMany({
      where,
      orderBy: p.orderBy,
      skip: p.skip,
      take: p.take,
      include: {
        pet: { select: { id: true, name: true, species: true, photoUrl: true, owner: { select: { id: true, fullName: true } } } },
        clinic: { select: { id: true, clinicName: true, registrationNumber: true } },
        recordedBy: { select: { id: true, fullName: true } },
      },
    }),
    prisma.vaccinationRecord.count({ where }),
  ]);
  return paginated(rows.map((r) => ({ ...r, boosterStatus: boosterStatus(r.boosterDueDate, now) })), total, p);
}

/**
 * VET_CLINIC: records at their own verified clinic, optionally verifying immediately.
 * PET_OWNER: submits a paper record for a chosen verified clinic — never self-verified.
 */
export async function createVaccination(user: SessionUser, body: z.output<typeof vaccinationCreateSchema>) {
  const pet = await prisma.pet.findUnique({ where: { id: body.petId }, select: { id: true, name: true, ownerId: true } });
  if (!pet) throw notFound("Pet");
  let clinicId: string;
  let verify = false;
  if (user.role === "VET_CLINIC") {
    clinicId = requireVerifiedClinic(user);
    verify = body.verify;
  } else {
    if (user.role === "PET_OWNER" && pet.ownerId !== user.id) throw forbidden("You can only submit records for your own pets");
    if (!body.clinicId) throw badRequest("Choose the clinic that administered the vaccine so it can verify the record");
    const clinic = await prisma.veterinaryClinic.findUnique({ where: { id: body.clinicId } });
    if (!clinic || clinic.verificationStatus !== "VERIFIED") throw badRequest("Selected clinic is not a verified clinic");
    clinicId = clinic.id;
    verify = user.role === "ADMIN" && body.verify;
  }
  const now = new Date();
  const record = await prisma.vaccinationRecord.create({
    data: {
      petId: pet.id,
      vetId: clinicId,
      recordedById: user.role === "VET_CLINIC" ? user.id : null,
      vaccineName: body.vaccineName,
      batchNumber: body.batchNumber,
      administeredDate: body.administeredDate,
      boosterDueDate: body.boosterDueDate ?? null,
      notes: body.notes ?? null,
      status: verify ? "VERIFIED" : "PENDING_VERIFICATION",
      verifiedAt: verify ? now : null,
    },
    include: { clinic: { select: { clinicName: true, userId: true } } },
  });
  if (verify) {
    await notify({
      userId: pet.ownerId,
      type: "ACCOUNT",
      title: `${record.vaccineName} recorded for ${pet.name}`,
      message: `${record.clinic.clinicName} verified a ${record.vaccineName} vaccination${record.boosterDueDate ? `. Next booster due ${record.boosterDueDate.toISOString().slice(0, 10)}` : ""}.`,
      link: `/app/pets/${pet.id}`,
    });
  } else if (user.role !== "VET_CLINIC") {
    await notify({
      userId: record.clinic.userId,
      type: "ACCOUNT",
      title: "Vaccination record awaiting verification",
      message: `A ${record.vaccineName} record for ${pet.name} (batch ${record.batchNumber}) was submitted for your clinic to verify.`,
      link: "/app/vaccinations?status=PENDING_VERIFICATION",
    });
  }
  return { record: { ...record, boosterStatus: boosterStatus(record.boosterDueDate, now) }, verified: verify, petId: pet.id };
}

async function load(user: SessionUser, id: string) {
  const r = await prisma.vaccinationRecord.findFirst({
    where: { AND: [{ id }, vaccinationScope(user)] },
    include: {
      pet: { select: { id: true, name: true, ownerId: true } },
      clinic: { select: { id: true, clinicName: true, registrationNumber: true, phone: true } },
      recordedBy: { select: { id: true, fullName: true } },
    },
  });
  if (!r) throw notFound("Vaccination record");
  return r;
}

/** Clinic holding the record (verified), the submitting owner while pending, or admin. */
function assertCanEdit(user: SessionUser, r: Awaited<ReturnType<typeof load>>) {
  if (r.status === "REVOKED") throw conflict("Revoked records cannot be changed");
  if (user.role === "ADMIN") return;
  if (user.role === "VET_CLINIC" && requireVerifiedClinic(user) === r.clinic.id) return;
  if (user.role === "PET_OWNER" && r.pet.ownerId === user.id && r.status === "PENDING_VERIFICATION") return;
  throw forbidden("You cannot modify this vaccination record");
}

export async function getVaccination(user: SessionUser, id: string) {
  const r = await load(user, id);
  return { ...r, boosterStatus: boosterStatus(r.boosterDueDate) };
}

export async function updateVaccination(user: SessionUser, id: string, body: z.output<typeof vaccinationUpdateSchema>) {
  const r = await load(user, id);
  assertCanEdit(user, r);
  const administered = body.administeredDate ?? r.administeredDate;
  const booster = body.boosterDueDate === undefined ? r.boosterDueDate : body.boosterDueDate;
  if (booster && booster <= administered) throw conflict("Booster due date must be after the administered date");
  const updated = await prisma.vaccinationRecord.update({ where: { id }, data: body });
  return { before: r, record: { ...updated, boosterStatus: boosterStatus(updated.boosterDueDate) } };
}

/** Only unverified records can be deleted; verified ones are revoked so the trail survives. */
export async function deleteVaccination(user: SessionUser, id: string) {
  const r = await load(user, id);
  if (r.status !== "PENDING_VERIFICATION") throw conflict("Verified or revoked records cannot be deleted. Revoke the record instead.");
  assertCanEdit(user, r);
  await prisma.vaccinationRecord.delete({ where: { id } });
  return r;
}

export async function decideVaccination(user: SessionUser, id: string, { decision, notes }: z.output<typeof vaccinationDecisionSchema>) {
  const r = await prisma.vaccinationRecord.findUnique({
    where: { id },
    include: { pet: { select: { id: true, name: true, ownerId: true } }, clinic: { select: { clinicName: true } } },
  });
  if (!r) throw notFound("Vaccination record");
  if (user.role !== "ADMIN" && requireVerifiedClinic(user) !== r.vetId) throw forbidden("Only the clinic named on this record can verify or revoke it");
  if (decision === "VERIFY" && r.status !== "PENDING_VERIFICATION") throw conflict(`Record is already ${r.status}`);
  if (decision === "REVOKE" && r.status === "REVOKED") throw conflict("Record is already revoked");

  const stamp = `[${new Date().toISOString().slice(0, 10)} ${decision === "VERIFY" ? "verified" : "revoked"} by ${user.fullName}]${notes ? ` ${notes}` : ""}`;
  const updated = await prisma.vaccinationRecord.update({
    where: { id },
    data: {
      status: decision === "VERIFY" ? "VERIFIED" : "REVOKED",
      verifiedAt: decision === "VERIFY" ? new Date() : r.verifiedAt,
      recordedById: r.recordedById ?? (user.role === "VET_CLINIC" ? user.id : null),
      notes: [r.notes, stamp].filter(Boolean).join("\n"),
    },
  });
  await notify({
    userId: r.pet.ownerId,
    type: "ACCOUNT",
    title: decision === "VERIFY" ? `${r.vaccineName} verified for ${r.pet.name}` : `${r.vaccineName} record revoked for ${r.pet.name}`,
    message:
      decision === "VERIFY"
        ? `${r.clinic.clinicName} verified the ${r.vaccineName} record (batch ${r.batchNumber}).`
        : `${r.clinic.clinicName} revoked the ${r.vaccineName} record (batch ${r.batchNumber})${notes ? `: ${notes}` : "."}`,
    link: `/app/pets/${r.pet.id}`,
  });
  return { before: r, record: { ...updated, boosterStatus: boosterStatus(updated.boosterDueDate) } };
}
