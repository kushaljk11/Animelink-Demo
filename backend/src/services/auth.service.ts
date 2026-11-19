// Credentials, sessions and role helpers (Section U "Authentication").
import type { Locale, Role, VerificationStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/http";
import { signSessionToken, verifySessionToken } from "./session-token";

export type SessionUser = {
  id: string;
  sessionId: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  wardNumber: number | null;
  municipality: string | null;
  locale: Locale;
  clinicId: string | null;
  clinicStatus: VerificationStatus | null;
  organizationId: string | null;
  organizationStatus: VerificationStatus | null;
};

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
let timingEqualizerHash: string | null = null;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/**
 * Email + password check with lockout after repeated failures. Unknown emails
 * still pay the bcrypt cost so timing does not reveal which emails exist.
 */
export async function authenticateCredentials(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: { accounts: { where: { provider: "credentials" } } },
  });
  const invalid = new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  if (!user) {
    timingEqualizerHash ??= await bcrypt.hash("timing-equalizer", BCRYPT_ROUNDS);
    await bcrypt.compare(password, timingEqualizerHash);
    throw invalid;
  }
  const account =
    user.accounts[0] ?? (await prisma.account.create({ data: { userId: user.id, provider: "credentials", providerAccountId: normalized } }));
  if (account.lockedUntil && account.lockedUntil > new Date()) {
    throw new ApiError(423, "Too many failed attempts. Try again later.", "ACCOUNT_LOCKED", { lockedUntil: account.lockedUntil.toISOString() });
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = account.failedAttempts + 1;
    const lock = failed >= MAX_FAILED_ATTEMPTS;
    await prisma.account.update({
      where: { id: account.id },
      data: { failedAttempts: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
    });
    throw invalid;
  }
  if (!user.isActive) throw new ApiError(403, "This account has been deactivated", "ACCOUNT_DISABLED");
  await prisma.account.update({ where: { id: account.id }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const { accounts: _a, ...rest } = user;
  return rest;
}

/** Creates a revocable server-side session and the signed token that points at it. */
export async function createSession(userId: string, role: Role, userAgent?: string | null) {
  const expiresAt = new Date(Date.now() + env.sessionTtlHours * 3_600_000);
  const session = await prisma.session.create({ data: { userId, expiresAt, userAgent: userAgent?.slice(0, 200) ?? null } });
  const token = await signSessionToken({ sub: userId, sid: session.id, role }, expiresAt);
  return { session, token, expiresAt };
}

export async function revokeSessionToken(token: string | undefined) {
  if (!token) return;
  const payload = await verifySessionToken(token);
  if (payload) await prisma.session.updateMany({ where: { id: payload.sid, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

/** Token → JWT signature → session row (not revoked/expired) → active user. */
export async function resolveSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: {
      user: {
        include: {
          veterinaryClinic: { select: { id: true, verificationStatus: true } },
          rescueOrganization: { select: { id: true, verificationStatus: true } },
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (session.userId !== payload.sub || !session.user.isActive) return null;
  const u = session.user;
  return {
    id: u.id,
    sessionId: session.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    role: u.role,
    wardNumber: u.wardNumber,
    municipality: u.municipality,
    locale: u.locale,
    clinicId: u.veterinaryClinic?.id ?? null,
    clinicStatus: u.veterinaryClinic?.verificationStatus ?? null,
    organizationId: u.rescueOrganization?.id ?? null,
    organizationStatus: u.rescueOrganization?.verificationStatus ?? null,
  };
}

/** ADMIN is a superuser and passes every role check. */
export function hasRole(user: Pick<SessionUser, "role"> | null | undefined, ...roles: Role[]): boolean {
  if (!user) return false;
  return user.role === "ADMIN" || roles.includes(user.role);
}

/** Vets may only write clinical records once their clinic is VERIFIED (Section L.7). */
export function requireVerifiedClinic(user: SessionUser): string {
  if (!user.clinicId) throw new ApiError(403, "No clinic profile is linked to this account", "NO_CLINIC");
  if (user.clinicStatus !== "VERIFIED") throw new ApiError(403, "Your clinic must be verified before recording vaccinations", "CLINIC_NOT_VERIFIED");
  return user.clinicId;
}

export function requireVerifiedOrganization(user: SessionUser): string {
  if (!user.organizationId) throw new ApiError(403, "No rescue organisation profile is linked to this account", "NO_ORGANIZATION");
  if (user.organizationStatus !== "VERIFIED") throw new ApiError(403, "Your organisation must be verified before recording CNVR activity", "ORG_NOT_VERIFIED");
  return user.organizationId;
}
