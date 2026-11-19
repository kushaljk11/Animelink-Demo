// Health, uploads, guarded file serving and AI endpoints.
import fs from "node:fs/promises";
import path from "node:path";
import { Species } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/db";
import { currentUser, hasRole } from "../middleware/auth";
import * as ai from "../services/ai.service";
import { CONTENT_TYPES, readUpload, resolveUploadPath, saveImageUpload } from "../services/uploads";
import { badRequest, clientIp, parseBody, rateLimit, param } from "../utils/http";
import { breedConfirmSchema, chatbotFeedbackSchema, chatbotSchema, uploadKindSchema, uploadUrl } from "../validators";

export async function health(_req: Request, res: Response) {
  const started = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok", database: "ok", latencyMs: Date.now() - started, time: new Date().toISOString() });
}

/** multipart: file=<image>, kind=pets|incidents|strays|breed. Guests may upload incident photos only. */
export async function upload(req: Request, res: Response) {
  const kind = uploadKindSchema.parse(req.body?.kind);
  if (!req.user && kind !== "incidents") throw badRequest("Sign in to upload this kind of image");
  rateLimit(`upload:${req.user?.id ?? clientIp(req)}`, req.user ? 60 : 5, 60 * 60_000);
  if (!req.file) throw badRequest("Attach the image as form field 'file'");
  const saved = await saveImageUpload(req.file, kind);
  res.status(201).json({ url: saved.url, bytes: saved.bytes, width: saved.width, height: saved.height });
}

/**
 * GET /uploads/* — pet, stray and breed images are public (QR profiles, maps).
 * Incident evidence is private (Section U): officers, rescue orgs, admins and the reporter only.
 */
export async function serveUpload(req: Request, res: Response) {
  const raw = (req.params as { path?: string | string[] }).path;
  const segments = Array.isArray(raw) ? raw : String(raw ?? "").split("/");
  const rel = segments.join("/");
  const abs = resolveUploadPath(rel);
  const notFound = () => res.status(404).type("text/plain").send("Not found");
  if (!abs) return notFound();
  const contentType = CONTENT_TYPES[path.extname(abs).toLowerCase()];
  if (!contentType) return notFound();

  let cacheControl = "public, max-age=86400, immutable";
  if (segments[0] === "incidents") {
    const user = req.user;
    if (!user) return notFound();
    if (!hasRole(user, "WARD_OFFICER", "RESCUE_ORG")) {
      const own = await prisma.biteIncident.findFirst({ where: { photoUrl: `/uploads/${rel}`, reportedById: user.id }, select: { id: true } });
      if (!own) return notFound();
    }
    cacheControl = "private, no-store";
  }
  try {
    const data = await fs.readFile(abs);
    res
      .set({
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "Cross-Origin-Resource-Policy": "same-site",
      })
      .send(data);
  } catch {
    notFound();
  }
}

// ------------------------------------------------------------------- AI

const breedFields = z.object({ species: z.nativeEnum(Species).default("DOG"), petId: z.string().min(1).max(40).optional() });

/** Breed finder: multipart `file` (+species, petId) or JSON { imageUrl } for an existing upload. */
export async function predictBreed(req: Request, res: Response) {
  const user = currentUser(req);
  rateLimit(`breed:${user.id}`, 30, 60 * 60_000);
  if (req.file) {
    const meta = breedFields.parse({ species: req.body?.species || undefined, petId: req.body?.petId || undefined });
    const saved = await saveImageUpload(req.file, "breed");
    return void res.status(201).json(await ai.predictBreed(user, saved.buffer, saved.url, meta.species, meta.petId));
  }
  const body = z.object({ imageUrl: uploadUrl() }).merge(breedFields).parse(req.body ?? {});
  const buf = await readUpload(body.imageUrl);
  if (!buf) throw badRequest("Image not found. Upload it first.");
  res.status(201).json(await ai.predictBreed(user, buf, body.imageUrl, body.species, body.petId));
}

export async function confirmBreed(req: Request, res: Response) {
  res.json(await ai.confirmBreed(currentUser(req), param(req, "id"), parseBody(req, breedConfirmSchema)));
}

export async function chat(req: Request, res: Response) {
  rateLimit(`chat:${req.user?.id ?? clientIp(req)}`, 30, 5 * 60_000);
  const body = parseBody(req, chatbotSchema);
  res.json(await ai.chat(req.user, body.message, body.locale, body.sessionKey));
}

export async function rateChat(req: Request, res: Response) {
  const body = parseBody(req, chatbotFeedbackSchema.extend({ sessionKey: z.string().max(64).optional() }));
  res.json(await ai.rateAnswer(req.user, param(req, "id"), body.helpful, body.sessionKey));
}
