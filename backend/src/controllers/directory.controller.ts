import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import { audit, type AuditAction } from "../services/audit";
import * as dir from "../services/directory.service";
import { parseBody, parseList, param } from "../utils/http";
import { clinicCreateSchema, clinicUpdateSchema, organizationCreateSchema, organizationUpdateSchema, verificationDecisionSchema } from "../validators";

/** One controller for both directories; `kind` is bound per route file. */
export function directoryController(kind: dir.DirectoryKind) {
  const entity = kind === "clinics" ? "VeterinaryClinic" : "RescueOrganization";
  const prefix = kind === "clinics" ? "CLINIC" : "ORGANIZATION";
  const createSchema = kind === "clinics" ? clinicCreateSchema : organizationCreateSchema;
  const updateSchema = kind === "clinics" ? clinicUpdateSchema : organizationUpdateSchema;
  const sortable = kind === "clinics" ? ["clinicName", "createdAt", "municipality", "verificationStatus"] : ["organizationName", "createdAt", "municipality", "verificationStatus"];
  const act = (s: string) => `${prefix}_${s}` as AuditAction;

  return {
    async list(req: Request, res: Response) {
      res.json(await dir.listDirectory(kind, req.user, parseList(req, sortable, sortable[0]!)));
    },
    async get(req: Request, res: Response) {
      res.json(await dir.getDirectoryEntry(kind, req.user, param(req, "id")));
    },
    async create(req: Request, res: Response) {
      const user = currentUser(req);
      const entry = await dir.createDirectoryEntry(kind, user, parseBody(req, createSchema));
      await audit({ actorId: user.id, action: act("CREATED"), entityType: entity, entityId: entry.id, after: entry, req });
      res.status(201).json(entry);
    },
    async update(req: Request, res: Response) {
      const user = currentUser(req);
      const body = parseBody(req, updateSchema);
      const { before, updated } = await dir.updateDirectoryEntry(kind, user, param(req, "id"), body);
      await audit({ actorId: user.id, action: act("UPDATED"), entityType: entity, entityId: updated.id, before, after: body, req });
      res.json(updated);
    },
    async remove(req: Request, res: Response) {
      const user = currentUser(req);
      const entry = await dir.deleteDirectoryEntry(kind, user, param(req, "id"));
      await audit({ actorId: user.id, action: act("DELETED"), entityType: entity, entityId: entry.id, before: entry, req });
      res.status(204).end();
    },
    async verify(req: Request, res: Response) {
      const admin = currentUser(req);
      const { status, note } = parseBody(req, verificationDecisionSchema);
      const { before, updated } = await dir.setVerification(kind, param(req, "id"), status, note);
      await audit({
        actorId: admin.id,
        action: act("VERIFICATION_CHANGED"),
        entityType: entity,
        entityId: updated.id,
        before: { verificationStatus: before.verificationStatus },
        after: { verificationStatus: status, note },
        req,
      });
      res.json(updated);
    },
  };
}
