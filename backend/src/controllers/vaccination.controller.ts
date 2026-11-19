import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import { audit } from "../services/audit";
import * as vax from "../services/vaccination-record.service";
import { parseBody, parseList, param } from "../utils/http";
import { vaccinationCreateSchema, vaccinationDecisionSchema, vaccinationUpdateSchema } from "../validators";

export async function list(req: Request, res: Response) {
  res.json(await vax.listVaccinations(currentUser(req), parseList(req, ["administeredDate", "boosterDueDate", "createdAt", "vaccineName", "verifiedAt"], "administeredDate")));
}

export async function create(req: Request, res: Response) {
  const user = currentUser(req);
  const { record, verified, petId } = await vax.createVaccination(user, parseBody(req, vaccinationCreateSchema));
  await audit({
    actorId: user.id,
    action: verified ? "VACCINATION_VERIFIED" : "VACCINATION_CREATED",
    entityType: "VaccinationRecord",
    entityId: record.id,
    after: { petId, vaccineName: record.vaccineName, batchNumber: record.batchNumber, status: record.status },
    req,
  });
  res.status(201).json(record);
}

export async function get(req: Request, res: Response) {
  res.json(await vax.getVaccination(currentUser(req), param(req, "id")));
}

export async function update(req: Request, res: Response) {
  const user = currentUser(req);
  const body = parseBody(req, vaccinationUpdateSchema);
  const { before, record } = await vax.updateVaccination(user, param(req, "id"), body);
  await audit({
    actorId: user.id,
    action: "VACCINATION_UPDATED",
    entityType: "VaccinationRecord",
    entityId: record.id,
    before: { vaccineName: before.vaccineName, batchNumber: before.batchNumber, administeredDate: before.administeredDate, boosterDueDate: before.boosterDueDate, notes: before.notes },
    after: body,
    req,
  });
  res.json(record);
}

export async function remove(req: Request, res: Response) {
  const user = currentUser(req);
  const r = await vax.deleteVaccination(user, param(req, "id"));
  await audit({ actorId: user.id, action: "VACCINATION_REVOKED", entityType: "VaccinationRecord", entityId: r.id, before: r, after: { deleted: true }, req });
  res.status(204).end();
}

export async function decide(req: Request, res: Response) {
  const user = currentUser(req);
  const body = parseBody(req, vaccinationDecisionSchema);
  const { before, record } = await vax.decideVaccination(user, param(req, "id"), body);
  await audit({
    actorId: user.id,
    action: body.decision === "VERIFY" ? "VACCINATION_VERIFIED" : "VACCINATION_REVOKED",
    entityType: "VaccinationRecord",
    entityId: record.id,
    before: { status: before.status },
    after: { status: record.status, notes: body.notes },
    req,
  });
  res.json(record);
}
