import { createHash } from "node:crypto";
import type { Request } from "express";
import { clientIp } from "../utils/http";
import { prisma } from "../config/db";
import { env } from "../config/env";

export type AuditAction =
  | "USER_REGISTERED"
  | "USER_UPDATED"
  | "USER_DEACTIVATED"
  | "PASSWORD_CHANGED"
  | "PET_CREATED"
  | "PET_UPDATED"
  | "PET_DELETED"
  | "PET_MARKED_LOST"
  | "PET_MARKED_FOUND"
  | "VACCINATION_CREATED"
  | "VACCINATION_UPDATED"
  | "VACCINATION_VERIFIED"
  | "VACCINATION_REVOKED"
  | "CLINIC_CREATED"
  | "CLINIC_UPDATED"
  | "CLINIC_VERIFICATION_CHANGED"
  | "CLINIC_DELETED"
  | "ORGANIZATION_CREATED"
  | "ORGANIZATION_UPDATED"
  | "ORGANIZATION_VERIFICATION_CHANGED"
  | "ORGANIZATION_DELETED"
  | "STRAY_CREATED"
  | "STRAY_UPDATED"
  | "STRAY_DELETED"
  | "CNVR_CREATED"
  | "CNVR_UPDATED"
  | "CNVR_DELETED"
  | "INCIDENT_CREATED"
  | "INCIDENT_UPDATED"
  | "INCIDENT_STATUS_CHANGED"
  | "INCIDENT_ASSIGNED"
  | "INCIDENT_CLAIMED"
  | "INCIDENT_RELEASED"
  | "INCIDENT_DELETED"
  | "REPORT_EXPORTED";

const json = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${env.auditSalt}:${ip}`).digest("hex").slice(0, 24);
}

/** Section U audit trail. Never throws: a logging failure must not fail the user's action. */
export async function audit(params: {
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  req?: Request;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        before: json(params.before),
        after: json(params.after),
        ipHash: params.req ? hashIp(clientIp(params.req)) : null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", err);
  }
}
