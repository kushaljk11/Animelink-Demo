// JWT session middleware and role guards.
import type { Role } from "@prisma/client";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { env } from "../config/env";
import { resolveSession, type SessionUser } from "../services/auth.service";
import { SESSION_COOKIE } from "../services/session-token";
import { ApiError, unauthorized } from "../utils/http";

export type { SessionUser } from "../services/auth.service";
export { hasRole, requireVerifiedClinic, requireVerifiedOrganization } from "../services/auth.service";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** null = anonymous; set for every request by `authenticate`. */
      user: SessionUser | null;
    }
  }
}

/** Resolves the httpOnly session cookie into req.user (never rejects — guards decide). */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  req.user = await resolveSession(req.cookies?.[SESSION_COOKIE]);
  next();
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw unauthorized();
  next();
};

/**
 * Role guard: `router.get("/", requireRole(["WARD_OFFICER"]), handler)`.
 * ADMIN always passes. (Brief roles map as ADMIN → ADMIN, OPERATOR → WARD_OFFICER, USER → PET_OWNER.)
 */
export function requireRole(roles: readonly Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (req.user.role !== "ADMIN" && !roles.includes(req.user.role)) {
      throw new ApiError(403, `This action requires one of: ${roles.join(", ")}`, "FORBIDDEN");
    }
    next();
  };
}

/** The authenticated user inside a handler that sits behind requireAuth/requireRole. */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env.isProd, path: "/", expires: expiresAt });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}
