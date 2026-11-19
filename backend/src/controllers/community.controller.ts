import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import { audit } from "../services/audit";
import * as community from "../services/community.service";
import { parseBody, parseList, param } from "../utils/http";
import { cnvrCreateSchema, cnvrUpdateSchema, duplicateCheckSchema, strayCreateSchema, strayUpdateSchema } from "../validators";

export async function listStrays(req: Request, res: Response) {
  res.json(await community.listStrays(currentUser(req), parseList(req, ["createdAt", "updatedAt", "tagOrEarMark", "municipality"], "createdAt")));
}

export async function createStray(req: Request, res: Response) {
  const user = currentUser(req);
  const result = await community.createStray(user, parseBody(req, strayCreateSchema));
  await audit({
    actorId: user.id,
    action: "STRAY_CREATED",
    entityType: "CommunityStray",
    entityId: result.stray.id,
    after: { ...result.stray, duplicateCandidatesShown: result.duplicateCandidates.map((c) => ({ id: c.stray.id, score: c.score })) },
    req,
  });
  res.status(201).json(result);
}

export async function getStray(req: Request, res: Response) {
  res.json(await community.getStray(param(req, "id")));
}

export async function updateStray(req: Request, res: Response) {
  const user = currentUser(req);
  const body = parseBody(req, strayUpdateSchema);
  const { before, updated } = await community.updateStray(param(req, "id"), body);
  await audit({ actorId: user.id, action: "STRAY_UPDATED", entityType: "CommunityStray", entityId: updated.id, before, after: body, req });
  res.json(updated);
}

export async function deleteStray(req: Request, res: Response) {
  const user = currentUser(req);
  const stray = await community.deleteStray(user, param(req, "id"));
  await audit({ actorId: user.id, action: "STRAY_DELETED", entityType: "CommunityStray", entityId: stray.id, before: stray, req });
  res.status(204).end();
}

export async function duplicates(req: Request, res: Response) {
  res.json(await community.checkDuplicates(parseBody(req, duplicateCheckSchema)));
}

export async function listCnvr(req: Request, res: Response) {
  res.json(await community.listCnvr(currentUser(req), parseList(req, ["createdAt", "vaccinationDate", "sterilizationDate", "releaseDate"], "createdAt")));
}

export async function createCnvr(req: Request, res: Response) {
  const user = currentUser(req);
  const body = parseBody(req, cnvrCreateSchema);
  const record = await community.createCnvr(user, body);
  await audit({ actorId: user.id, action: "CNVR_CREATED", entityType: "CnvrRecord", entityId: record.id, after: body, req });
  res.status(201).json(record);
}

export async function getCnvr(req: Request, res: Response) {
  res.json(await community.getCnvr(param(req, "id")));
}

export async function updateCnvr(req: Request, res: Response) {
  const user = currentUser(req);
  const body = parseBody(req, cnvrUpdateSchema);
  const { before, updated } = await community.updateCnvr(user, param(req, "id"), body);
  await audit({ actorId: user.id, action: "CNVR_UPDATED", entityType: "CnvrRecord", entityId: updated.id, before, after: body, req });
  res.json(updated);
}

export async function deleteCnvr(req: Request, res: Response) {
  const user = currentUser(req);
  const record = await community.deleteCnvr(user, param(req, "id"));
  await audit({ actorId: user.id, action: "CNVR_DELETED", entityType: "CnvrRecord", entityId: record.id, before: record, req });
  res.status(204).end();
}
