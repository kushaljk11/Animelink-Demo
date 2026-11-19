// Veterinary clinics & rescue organisations directory + admin verification (Sections H.14, K.2–K.3).
import { VerificationStatus, type Prisma } from "@prisma/client";
import { prisma } from "../config/db";
import { badRequest, boolParam, conflict, enumFilter, forbidden, intParam, notFound, paginated, type ListParams } from "../utils/http";
import { hasRole, type SessionUser } from "./auth.service";
import { notify } from "./notify";

export type DirectoryKind = "clinics" | "organizations";
const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });

const META = {
  clinics: { role: "VET_CLINIC" as const, label: "Clinic", relation: "veterinaryClinic" as const, nameField: "clinicName" as const },
  organizations: { role: "RESCUE_ORG" as const, label: "Organisation", relation: "rescueOrganization" as const, nameField: "organizationName" as const },
};

/** Public sees VERIFIED only; admin & ward officers see every status. */
export async function listDirectory(kind: DirectoryKind, user: SessionUser | null, p: ListParams) {
  const privileged = hasRole(user, "WARD_OFFICER");
  const statuses = privileged ? enumFilter(p.status, VerificationStatus) : (["VERIFIED"] as VerificationStatus[]);
  const ward = intParam(p.sp, "wardNumber");
  const municipality = p.sp.get("municipality");
  const base = {
    ...(statuses ? { verificationStatus: { in: statuses } } : {}),
    ...(municipality ? { municipality } : {}),
    ...(ward ? { wardNumber: ward } : {}),
  };
  if (kind === "clinics") {
    const where: Prisma.VeterinaryClinicWhereInput = {
      ...base,
      ...(p.query ? { OR: [{ clinicName: ci(p.query) }, { address: ci(p.query) }, { registrationNumber: ci(p.query) }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.veterinaryClinic.findMany({
        where,
        orderBy: p.orderBy,
        skip: p.skip,
        take: p.take,
        include: privileged ? { user: { select: { id: true, fullName: true, email: true } }, _count: { select: { vaccinationRecords: true } } } : undefined,
      }),
      prisma.veterinaryClinic.count({ where }),
    ]);
    return paginated(rows, total, p);
  }
  const hasShelter = boolParam(p.sp, "hasShelter");
  const where: Prisma.RescueOrganizationWhereInput = {
    ...base,
    ...(hasShelter !== undefined ? { hasShelter } : {}),
    ...(p.query ? { OR: [{ organizationName: ci(p.query) }, { address: ci(p.query) }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.rescueOrganization.findMany({
      where,
      orderBy: p.orderBy,
      skip: p.skip,
      take: p.take,
      include: privileged ? { user: { select: { id: true, fullName: true, email: true } }, _count: { select: { cnvrRecords: true } } } : undefined,
    }),
    prisma.rescueOrganization.count({ where }),
  ]);
  return paginated(rows, total, p);
}

async function find(kind: DirectoryKind, id: string) {
  return kind === "clinics"
    ? prisma.veterinaryClinic.findUnique({ where: { id }, include: { _count: { select: { vaccinationRecords: true } } } })
    : prisma.rescueOrganization.findUnique({ where: { id }, include: { _count: { select: { cnvrRecords: true } } } });
}

export async function getDirectoryEntry(kind: DirectoryKind, user: SessionUser | null, id: string) {
  const entry = await find(kind, id);
  if (!entry) throw notFound(META[kind].label);
  if (entry.verificationStatus !== "VERIFIED" && user?.id !== entry.userId && !hasRole(user, "WARD_OFFICER")) throw notFound(META[kind].label);
  return entry;
}

/** An account without a profile creates its own; admin can create one for any matching account (pre-verified). */
export async function createDirectoryEntry(kind: DirectoryKind, user: SessionUser, input: Record<string, unknown> & { userId?: string }) {
  const { userId: requested, ...data } = input;
  const userId = user.role === "ADMIN" ? requested : user.id;
  if (!userId) throw badRequest(`userId is required when an admin creates a ${META[kind].label.toLowerCase()}`);
  const owner = await prisma.user.findUnique({ where: { id: userId }, include: { veterinaryClinic: { select: { id: true } }, rescueOrganization: { select: { id: true } } } });
  if (!owner) throw notFound("User");
  if (owner.role !== META[kind].role) throw badRequest(`${META[kind].label} profiles can only belong to ${META[kind].role} accounts`);
  if (owner[META[kind].relation]) throw conflict(`This account already has a ${META[kind].label.toLowerCase()} profile`);
  const status: VerificationStatus = user.role === "ADMIN" ? "VERIFIED" : "PENDING";
  return kind === "clinics"
    ? prisma.veterinaryClinic.create({ data: { ...(data as Prisma.VeterinaryClinicUncheckedCreateInput), userId, verificationStatus: status } })
    : prisma.rescueOrganization.create({ data: { ...(data as Prisma.RescueOrganizationUncheckedCreateInput), userId, verificationStatus: status } });
}

/** Changing a clinic's registration number sends it back for re-verification. */
export async function updateDirectoryEntry(kind: DirectoryKind, user: SessionUser, id: string, body: Record<string, unknown>) {
  const entry = await find(kind, id);
  if (!entry) throw notFound(META[kind].label);
  if (user.role !== "ADMIN" && entry.userId !== user.id) throw forbidden(`You can only edit your own ${META[kind].label.toLowerCase()}`);
  if (kind === "clinics") {
    const regChanged = body.registrationNumber !== undefined && body.registrationNumber !== (entry as { registrationNumber: string }).registrationNumber;
    const updated = await prisma.veterinaryClinic.update({ where: { id }, data: { ...body, ...(regChanged && user.role !== "ADMIN" ? { verificationStatus: "PENDING" } : {}) } });
    return { before: entry, updated };
  }
  return { before: entry, updated: await prisma.rescueOrganization.update({ where: { id }, data: body }) };
}

/** Entries with history are protected by FK RESTRICT (→ 409); suspend them instead. */
export async function deleteDirectoryEntry(kind: DirectoryKind, user: SessionUser, id: string) {
  if (user.role !== "ADMIN") throw forbidden(`Only administrators can delete ${kind}`);
  const entry = await find(kind, id);
  if (!entry) throw notFound(META[kind].label);
  if (kind === "clinics") await prisma.veterinaryClinic.delete({ where: { id } });
  else await prisma.rescueOrganization.delete({ where: { id } });
  return entry;
}

export async function setVerification(kind: DirectoryKind, id: string, status: VerificationStatus, note?: string | null) {
  const entry = await find(kind, id);
  if (!entry) throw notFound(META[kind].label);
  const updated =
    kind === "clinics"
      ? await prisma.veterinaryClinic.update({ where: { id }, data: { verificationStatus: status } })
      : await prisma.rescueOrganization.update({ where: { id }, data: { verificationStatus: status } });
  const name = (entry as { clinicName?: string; organizationName?: string }).clinicName ?? (entry as { organizationName?: string }).organizationName;
  await notify({
    userId: entry.userId,
    type: "ACCOUNT",
    title: `${META[kind].label} ${status.toLowerCase()}`,
    message:
      status === "VERIFIED"
        ? `${name} is now verified. ${kind === "clinics" ? "You can record and verify vaccinations." : "You can record CNVR activity."}`
        : `${name} was marked ${status.toLowerCase()}${note ? `: ${note}` : "."}`,
    link: "/app/settings#organisation",
  });
  return { before: entry, updated };
}
