import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import { audit } from "../services/audit";
import * as pets from "../services/pet.service";
import { badRequest, clientIp, parseBody, parseList, rateLimit, searchParams, param } from "../utils/http";
import { lostReportUpdateSchema, markFoundSchema, markLostSchema, petCreateSchema, petMedicalUpdateSchema, petUpdateSchema, qrScanSchema } from "../validators";

const id = (req: Request) => param(req, "id");

export async function list(req: Request, res: Response) {
  res.json(await pets.listPets(currentUser(req), parseList(req, ["createdAt", "updatedAt", "name", "species", "dateOfBirth"], "createdAt")));
}

export async function create(req: Request, res: Response) {
  const user = currentUser(req);
  const pet = await pets.createPet(user, parseBody(req, petCreateSchema));
  await audit({ actorId: user.id, action: "PET_CREATED", entityType: "Pet", entityId: pet.id, after: { name: pet.name, species: pet.species }, req });
  res.status(201).json(pet);
}

export async function get(req: Request, res: Response) {
  res.json(await pets.getPet(currentUser(req), id(req)));
}

export async function update(req: Request, res: Response) {
  const user = currentUser(req);
  const { before, after, pet } = await pets.updatePet(user, id(req), req.body, { owner: petUpdateSchema, medical: petMedicalUpdateSchema });
  await audit({ actorId: user.id, action: "PET_UPDATED", entityType: "Pet", entityId: pet.id, before, after, req });
  res.json(pet);
}

export async function remove(req: Request, res: Response) {
  const user = currentUser(req);
  const { pet, verified } = await pets.deletePet(user, id(req));
  await audit({ actorId: user.id, action: "PET_DELETED", entityType: "Pet", entityId: pet.id, before: { name: pet.name, ownerId: pet.ownerId, verifiedVaccinations: verified }, req });
  res.status(204).end();
}

export async function markLost(req: Request, res: Response) {
  const user = currentUser(req);
  const report = await pets.markLost(user, id(req), parseBody(req, markLostSchema));
  await audit({ actorId: user.id, action: "PET_MARKED_LOST", entityType: "Pet", entityId: id(req), after: { lostReportId: report.id }, req });
  res.status(201).json(report);
}

export async function markFound(req: Request, res: Response) {
  const user = currentUser(req);
  const result = await pets.markFound(user, id(req), parseBody(req, markFoundSchema).note);
  await audit({ actorId: user.id, action: "PET_MARKED_FOUND", entityType: "Pet", entityId: id(req), after: { reportsResolved: result.reportsResolved }, req });
  res.json(result);
}

/** QR image linking to the public emergency profile. ?format=png|svg&size=128..1024&download=1 */
export async function qr(req: Request, res: Response) {
  const sp = searchParams(req);
  const format = sp.get("format") ?? "png";
  const size = Number(sp.get("size") ?? 512);
  if (format !== "png" && format !== "svg") throw badRequest("format must be png or svg");
  if (!Number.isInteger(size) || size < 128 || size > 1024) throw badRequest("size must be an integer between 128 and 1024");
  const out = await pets.qrImage(currentUser(req), id(req), format, size);
  res
    .set({
      "Content-Type": format === "svg" ? "image/svg+xml" : "image/png",
      "Content-Disposition": sp.get("download") ? `attachment; filename="${out.filename}"` : "inline",
      "Cache-Control": "private, max-age=3600",
      "X-QR-Target": out.url,
    })
    .send(out.body);
}

export async function certificate(req: Request, res: Response) {
  const { pdf, filename } = await pets.certificate(currentUser(req), id(req));
  res
    .set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `${searchParams(req).get("inline") ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    })
    .send(Buffer.from(pdf));
}

// --- public QR profile ---

export async function publicProfile(req: Request, res: Response) {
  rateLimit(`qr-view:${clientIp(req)}`, 60, 10 * 60_000);
  res.set("Cache-Control", "no-store").json(await pets.publicProfile(param(req, "token")));
}

export async function publicScan(req: Request, res: Response) {
  rateLimit(`qr-scan:${clientIp(req)}:${param(req, "token")}`, 10, 10 * 60_000);
  res.status(201).json(await pets.recordScan(param(req, "token"), parseBody(req, qrScanSchema), req.get("user-agent")));
}

// --- lost reports & scans ---

export async function listLost(req: Request, res: Response) {
  if (!req.user) rateLimit(`lost-list:${clientIp(req)}`, 60, 10 * 60_000);
  res.json(await pets.listLostReports(req.user, parseList(req, ["createdAt", "lastSeenDate", "resolvedAt"], "lastSeenDate")));
}

export async function getLost(req: Request, res: Response) {
  res.json(await pets.getLostReport(currentUser(req), id(req)));
}

export async function updateLost(req: Request, res: Response) {
  const user = currentUser(req);
  const body = parseBody(req, lostReportUpdateSchema);
  const { report, updated, closing, reopening } = await pets.updateLostReport(user, id(req), body);
  await audit({
    actorId: user.id,
    action: closing ? "PET_MARKED_FOUND" : reopening ? "PET_MARKED_LOST" : "PET_UPDATED",
    entityType: "LostPetReport",
    entityId: report.id,
    before: { status: report.status },
    after: body,
    req,
  });
  res.json(updated);
}

export async function listScans(req: Request, res: Response) {
  res.json(await pets.listQrScans(currentUser(req), parseList(req, ["scannedAt"], "scannedAt")));
}
