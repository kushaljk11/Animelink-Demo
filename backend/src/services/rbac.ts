// Row-level access rules (Section K "Permission Principle", Section U "Secure API Access").
// Route handlers combine these scopes with their own filters so a user can never
// list or fetch rows outside their role's view.
import type { BiteIncident, Pet, Prisma, User } from "@prisma/client";
import { forbidden } from "../utils/http";
import { hasRole, type SessionUser } from "./auth.service";

// ------------------------------------------------------------------- pets ---

/** Owners see their own pets; vets can search registered pets (K.2); admin sees all. */
export function petScope(user: SessionUser): Prisma.PetWhereInput {
  if (hasRole(user, "VET_CLINIC")) return {};
  if (user.role === "PET_OWNER") return { ownerId: user.id };
  throw forbidden("Your role cannot access pet records");
}

export function assertPetOwnerOrAdmin(user: SessionUser, pet: Pick<Pet, "ownerId">) {
  if (user.role === "ADMIN" || pet.ownerId === user.id) return;
  throw forbidden("Only the pet's owner can do this");
}

// ----------------------------------------------------------- vaccinations ---

export function vaccinationScope(user: SessionUser): Prisma.VaccinationRecordWhereInput {
  if (hasRole(user, "VET_CLINIC", "WARD_OFFICER")) return {};
  if (user.role === "PET_OWNER") return { pet: { ownerId: user.id } };
  throw forbidden("Your role cannot access vaccination records");
}

// -------------------------------------------------------------- incidents ---

/**
 * Ward officers monitor their own municipality (L.26); rescue orgs read incidents
 * "where permitted" (K.3) with reporter details redacted; everyone else sees only
 * what they reported.
 */
export function incidentScope(user: SessionUser): Prisma.BiteIncidentWhereInput {
  if (user.role === "ADMIN") return {};
  if (user.role === "WARD_OFFICER") return user.municipality ? { municipality: user.municipality } : {};
  if (user.role === "RESCUE_ORG") return {};
  return { reportedById: user.id };
}

export function canManageIncidents(user: SessionUser) {
  return hasRole(user, "WARD_OFFICER");
}

/** Officers, the reporter, and whoever has taken the case (e.g. a rescue team that needs to call the reporter). */
export function canSeeReporterDetails(user: SessionUser, incident: Pick<BiteIncident, "reportedById"> & { handledById?: string | null }) {
  return hasRole(user, "WARD_OFFICER") || incident.reportedById === user.id || (!!incident.handledById && incident.handledById === user.id);
}

export function redactIncident<T extends Pick<BiteIncident, "reportedById" | "reporterName" | "reporterPhone"> & { handledById?: string | null }>(
  user: SessionUser,
  incident: T,
): T {
  if (canSeeReporterDetails(user, incident)) return incident;
  const copy: T & { reportedBy?: unknown } = { ...incident, reportedById: null, reporterName: null, reporterPhone: null };
  delete copy.reportedBy;
  return copy;
}

// ----------------------------------------------------------------- strays ---

export function assertCanManageStrays(user: SessionUser) {
  if (!hasRole(user, "RESCUE_ORG")) throw forbidden("Only rescue organisations can manage stray records");
}

export function assertCanViewStrays(user: SessionUser) {
  if (!hasRole(user, "RESCUE_ORG", "WARD_OFFICER", "VET_CLINIC")) {
    throw forbidden("Your role cannot access stray / CNVR records");
  }
}

// ------------------------------------------------------------------ users ---

export type SafeUser = Omit<User, "passwordHash">;

export function safeUser<U extends User>(u: U): Omit<U, "passwordHash"> {
  const { passwordHash: _omit, ...rest } = u;
  return rest;
}
