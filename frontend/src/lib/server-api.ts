// Server-side calls to the API from Server Components, forwarding the visitor's session cookie.
import { cookies } from "next/headers";
import type { ClientSession } from "./client/session";
import type { Role } from "./constants";

const INTERNAL_API_URL = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "production"
  ? "https://animelink-demo.onrender.com/api"
  : "http://localhost:5000/api")).replace(/\/+$/, "");

export type ServerResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; data: null };

export async function serverApi<T>(path: string): Promise<ServerResult<T>> {
  const cookieHeader = (await cookies()).toString();
  try {
    const res = await fetch(`${INTERNAL_API_URL}${path}`, { headers: cookieHeader ? { cookie: cookieHeader } : {}, cache: "no-store" });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    return { ok: true, status: res.status, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

type MeResponse = {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    municipality: string | null;
    wardNumber: number | null;
    locale: "EN" | "NE";
    veterinaryClinic: { id: string; verificationStatus: string } | null;
    rescueOrganization: { id: string; verificationStatus: string } | null;
  };
};

/** The signed-in user as the client shell needs it, or null when anonymous / session expired. */
export async function getServerSession(): Promise<ClientSession | null> {
  const r = await serverApi<MeResponse>("/auth/me");
  if (!r.ok) return null;
  const u = r.data.user;
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    municipality: u.municipality,
    wardNumber: u.wardNumber,
    locale: u.locale,
    clinicId: u.veterinaryClinic?.id ?? null,
    clinicStatus: u.veterinaryClinic?.verificationStatus ?? null,
    organizationId: u.rescueOrganization?.id ?? null,
    organizationStatus: u.rescueOrganization?.verificationStatus ?? null,
    roleSwitcherEnabled: process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_ROLE_SWITCHER === "true",
  };
}
