"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Role } from "@/lib/constants";

export type ClientSession = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  municipality: string | null;
  wardNumber: number | null;
  locale: "EN" | "NE";
  clinicId: string | null;
  clinicStatus: string | null;
  organizationId: string | null;
  organizationStatus: string | null;
  roleSwitcherEnabled: boolean;
};

const SessionContext = createContext<ClientSession | null>(null);

export function SessionProvider({ session, children }: { session: ClientSession; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): ClientSession {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside the authenticated app shell");
  return s;
}

/** ADMIN passes every check, mirroring the server's requireRole(). */
export function can(session: Pick<ClientSession, "role">, ...roles: Role[]) {
  return session.role === "ADMIN" || roles.includes(session.role);
}
