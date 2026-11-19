// Edge-safe JWT helpers (no Node APIs, no Prisma) so middleware can import them.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "rtn_session";
const ISSUER = "rabies-track-nepal";
const DEV_FALLBACK_SECRET = "rtn-insecure-dev-secret-do-not-use-in-production!!";

export type TokenPayload = { sub: string; sid: string; role: string };

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET must be set to at least 32 characters in production");
    }
    return new TextEncoder().encode(DEV_FALLBACK_SECRET);
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: TokenPayload, expiresAt: Date): Promise<string> {
  return new SignJWT({ sid: payload.sid, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISSUER, algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return { sub: payload.sub, sid: payload.sid, role: payload.role };
  } catch {
    return null;
  }
}
