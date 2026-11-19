import type { Role } from "@prisma/client";
import type { Request, Response } from "express";
import { prisma } from "../config/db";
import { clearSessionCookie, currentUser, setSessionCookie } from "../middleware/auth";
import { audit } from "../services/audit";
import { authenticateCredentials, createSession, revokeSessionToken } from "../services/auth.service";
import { SESSION_COOKIE } from "../services/session-token";
import * as users from "../services/user.service";
import { ApiError, clientIp, parseBody, rateLimit } from "../utils/http";
import { changePasswordSchema, loginSchema, registerSchema, switchRoleSchema, updateProfileSchema } from "../validators";

const DEMO_ACCOUNTS: Record<Role, string> = {
  ADMIN: "admin@local.dev",
  WARD_OFFICER: "operator@local.dev",
  PET_OWNER: "user@local.dev",
  VET_CLINIC: "vet@local.dev",
  RESCUE_ORG: "rescue@local.dev",
};

async function signIn(req: Request, res: Response, user: { id: string; role: Role }) {
  const { token, expiresAt } = await createSession(user.id, user.role, req.get("user-agent"));
  setSessionCookie(res, token, expiresAt);
  return expiresAt;
}

export async function register(req: Request, res: Response) {
  rateLimit(`register:${clientIp(req)}`, 10, 60 * 60_000);
  const user = await users.registerUser(parseBody(req, registerSchema));
  await signIn(req, res, user);
  await audit({ actorId: user.id, action: "USER_REGISTERED", entityType: "User", entityId: user.id, after: { role: user.role }, req });
  res.status(201).json({
    user: users.safeUser(user),
    notice: user.role === "PET_OWNER" ? null : "Your organisation profile is pending verification by an administrator.",
  });
}

export async function login(req: Request, res: Response) {
  rateLimit(`login:${clientIp(req)}`, 20, 15 * 60_000);
  const { email, password } = parseBody(req, loginSchema);
  const user = await authenticateCredentials(email, password);
  const expiresAt = await signIn(req, res, user);
  res.json({ user: users.safeUser(user), expiresAt });
}

export async function logout(req: Request, res: Response) {
  await revokeSessionToken(req.cookies?.[SESSION_COOKIE]);
  clearSessionCookie(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json(await users.getProfile(currentUser(req)));
}

export async function updateMe(req: Request, res: Response) {
  const user = currentUser(req);
  const body = parseBody(req, updateProfileSchema);
  const { before, user: updated } = await users.updateProfile(user, body);
  await audit({
    actorId: user.id,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: user.id,
    before: { fullName: before.fullName, phone: before.phone, wardNumber: before.wardNumber, municipality: before.municipality, locale: before.locale },
    after: body,
    req,
  });
  res.json({ user: users.safeUser(updated) });
}

export async function changePassword(req: Request, res: Response) {
  const user = currentUser(req);
  await users.changePassword(user, parseBody(req, changePasswordSchema));
  await audit({ actorId: user.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id, req });
  res.json({ message: "Password updated. Other sessions have been signed out." });
}

// --- local role switcher (development only) ---

function assertRoleSwitcherEnabled() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_ROLE_SWITCHER !== "true") throw new ApiError(404, "Not found", "NOT_FOUND");
}

export async function listDemoAccounts(_req: Request, res: Response) {
  assertRoleSwitcherEnabled();
  const accounts = await prisma.user.findMany({ where: { email: { in: Object.values(DEMO_ACCOUNTS) } }, select: { email: true, fullName: true, role: true } });
  res.json({ accounts });
}

export async function switchRole(req: Request, res: Response) {
  assertRoleSwitcherEnabled();
  const { role } = parseBody(req, switchRoleSchema);
  const user = await prisma.user.findUnique({ where: { email: DEMO_ACCOUNTS[role] } });
  if (!user || !user.isActive) throw new ApiError(404, `Demo account for ${role} not found. Run npm run db:setup.`, "DEMO_ACCOUNT_MISSING");
  await revokeSessionToken(req.cookies?.[SESSION_COOKIE]);
  await signIn(req, res, user);
  res.json({ user: users.safeUser(user) });
}
