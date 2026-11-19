import type { Request, Response } from "express";
import { outbox } from "../services/notification.service";
import * as pub from "../services/public.service";
import { clientIp, param, parseBody, parseQuery, searchParams } from "../utils/http";
import { inquiryCreateSchema, inquiryStatusSchema, otpRequestSchema, trackQuerySchema } from "../validators";

/** GET /public/track?query=NP-XXXX-XXXX | 98XXXXXXXX */
export async function track(req: Request, res: Response) {
  const { query } = parseQuery(req, trackQuerySchema);
  res.set("Cache-Control", "no-store").json(await pub.track(query, clientIp(req)));
}

export async function requestOtp(req: Request, res: Response) {
  res.json(await pub.requestOtp(parseBody(req, otpRequestSchema).phone, clientIp(req)));
}

export async function createInquiry(req: Request, res: Response) {
  res.status(201).json(await pub.createInquiry(parseBody(req, inquiryCreateSchema), clientIp(req)));
}

export async function milestones(_req: Request, res: Response) {
  res.set("Cache-Control", "public, max-age=300").json(await pub.resolvedMilestones());
}

/** Test harness only (NOTIFY_MODE=test): the SMS the app would have sent. 404 in every other mode. */
export async function testOutbox(_req: Request, res: Response) {
  if (process.env.NOTIFY_MODE !== "test") return res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
  res.json({ data: outbox.slice(-50) });
}

export async function listInquiries(req: Request, res: Response) {
  const sp = searchParams(req);
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 20));
  res.json(await pub.listInquiries(page, limit, sp.get("status") ?? undefined));
}

export async function setInquiryStatus(req: Request, res: Response) {
  res.json(await pub.setInquiryStatus(param(req, "id"), parseBody(req, inquiryStatusSchema).status));
}
