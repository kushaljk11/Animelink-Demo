import { Role, type Prisma, type User } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../config/db";
import { badRequest, conflict, enumFilter, intParam, boolParam, notFound, paginated, type ListParams, ApiError } from "../utils/http";
import type { adminCreateUserSchema, adminUpdateUserSchema, changePasswordSchema, registerSchema, updateProfileSchema } from "../validators";
import { hashPassword, revokeAllSessions, verifyPassword, type SessionUser } from "./auth.service";

export function safeUser<U extends User>(u: U): Omit<U, "passwordHash"> {
  const { passwordHash: _omit, ...rest } = u;
  return rest;
}

/** Self-registration for pet owners, clinics and rescue organisations (L.1). Profiles start PENDING. */
export async function registerUser(body: z.output<typeof registerSchema>) {
  if (await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } })) throw conflict("An account with this email already exists");
  if (body.clinic && (await prisma.veterinaryClinic.findUnique({ where: { registrationNumber: body.clinic.registrationNumber }, select: { id: true } }))) {
    throw conflict("A clinic with this registration number is already registered");
  }
  const passwordHash = await hashPassword(body.password);
  return prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        fullName: body.fullName,
        email: body.email,
        phone: body.phone ?? null,
        passwordHash,
        role: body.role,
        wardNumber: body.wardNumber ?? null,
        municipality: body.municipality ?? null,
        locale: body.locale ?? "EN",
        accounts: { create: { provider: "credentials", providerAccountId: body.email } },
      },
    });
    if (body.role === "VET_CLINIC" && body.clinic) await tx.veterinaryClinic.create({ data: { ...body.clinic, userId: u.id, verificationStatus: "PENDING" } });
    if (body.role === "RESCUE_ORG" && body.organization) await tx.rescueOrganization.create({ data: { ...body.organization, userId: u.id, verificationStatus: "PENDING" } });
    return u;
  });
}

export async function getProfile(user: SessionUser) {
  const [u, unreadNotifications] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { veterinaryClinic: true, rescueOrganization: true } }),
    prisma.notification.count({ where: { userId: user.id, status: "SENT", readAt: null } }),
  ]);
  return { user: safeUser(u), unreadNotifications, sessionId: user.sessionId };
}

export async function updateProfile(user: SessionUser, body: z.output<typeof updateProfileSchema>) {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const updated = await prisma.user.update({ where: { id: user.id }, data: body });
  return { before, user: updated };
}

export async function changePassword(user: SessionUser, body: z.output<typeof changePasswordSchema>) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(body.currentPassword, u.passwordHash))) throw new ApiError(400, "Current password is incorrect", "INVALID_PASSWORD");
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
  await revokeAllSessions(u.id, user.sessionId);
}

export async function listUsers(p: ListParams) {
  const roles = enumFilter(p.sp.get("role")?.split(","), Role, "role");
  const isActive = boolParam(p.sp, "isActive");
  const ward = intParam(p.sp, "wardNumber");
  const ci = p.query ? { contains: p.query, mode: "insensitive" as const } : undefined;
  const where: Prisma.UserWhereInput = {
    ...(roles ? { role: { in: roles } } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(p.sp.get("municipality") ? { municipality: p.sp.get("municipality")! } : {}),
    ...(ward ? { wardNumber: ward } : {}),
    ...(ci ? { OR: [{ fullName: ci }, { email: ci }, { phone: ci }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: p.orderBy,
      skip: p.skip,
      take: p.take,
      include: {
        veterinaryClinic: { select: { id: true, clinicName: true, verificationStatus: true } },
        rescueOrganization: { select: { id: true, organizationName: true, verificationStatus: true } },
        _count: { select: { pets: true, incidentsReported: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return paginated(rows.map(safeUser), total, p);
}

export async function adminCreateUser(body: z.output<typeof adminCreateUserSchema>) {
  if (await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } })) throw conflict("An account with this email already exists");
  return prisma.user.create({
    data: {
      fullName: body.fullName,
      email: body.email,
      phone: body.phone ?? null,
      passwordHash: await hashPassword(body.password),
      role: body.role,
      wardNumber: body.wardNumber ?? null,
      municipality: body.municipality ?? null,
      locale: body.locale ?? "EN",
      accounts: { create: { provider: "credentials", providerAccountId: body.email } },
    },
  });
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      veterinaryClinic: true,
      rescueOrganization: true,
      _count: { select: { pets: true, incidentsReported: true, registeredStrays: true, vaccinationsRecorded: true } },
      sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, userAgent: true, expiresAt: true } },
    },
  });
  if (!user) throw notFound("User");
  return safeUser(user);
}

export async function adminUpdateUser(admin: SessionUser, id: string, body: z.output<typeof adminUpdateUserSchema>) {
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw notFound("User");
  if (before.id === admin.id && (body.isActive === false || (body.role && body.role !== "ADMIN"))) throw badRequest("You cannot deactivate or demote your own admin account");
  const user = await prisma.user.update({ where: { id }, data: body });
  if (body.isActive === false || (body.role && body.role !== before.role)) await revokeAllSessions(user.id);
  return { before, user };
}

/** Soft delete: accounts own audit-relevant records, so they are deactivated, not erased. */
export async function deactivateUser(admin: SessionUser, id: string) {
  if (id === admin.id) throw badRequest("You cannot deactivate your own account");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("User");
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  await revokeAllSessions(id);
  return user;
}
