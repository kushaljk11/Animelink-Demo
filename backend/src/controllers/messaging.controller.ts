import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import * as messaging from "../services/messaging.service";
import { runReminderSweep } from "../services/reminders";
import { parseBody, parseList, searchParams, param } from "../utils/http";
import { conversationCreateSchema, messageCreateSchema, notificationUpdateSchema } from "../validators";

export async function listNotifications(req: Request, res: Response) {
  res.json(await messaging.listNotifications(currentUser(req), parseList(req, ["scheduledAt", "sentAt"], "sentAt")));
}

export async function updateNotification(req: Request, res: Response) {
  res.json(await messaging.setRead(currentUser(req), param(req, "id"), parseBody(req, notificationUpdateSchema).read));
}

export async function deleteNotification(req: Request, res: Response) {
  await messaging.deleteNotification(currentUser(req), param(req, "id"));
  res.status(204).end();
}

export async function readAll(req: Request, res: Response) {
  res.json(await messaging.readAll(currentUser(req)));
}

/** Runs the booster-reminder sweep now (it also runs on a timer). Idempotent. */
export async function runReminders(_req: Request, res: Response) {
  res.json(await runReminderSweep());
}

export async function listConversations(req: Request, res: Response) {
  res.json(await messaging.listConversations(currentUser(req), parseList(req, ["updatedAt", "createdAt"], "updatedAt")));
}

export async function startConversation(req: Request, res: Response) {
  res.status(201).json(await messaging.startConversation(currentUser(req), parseBody(req, conversationCreateSchema)));
}

export async function listMessages(req: Request, res: Response) {
  const sp = searchParams(req);
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 200);
  const beforeRaw = sp.get("before");
  const before = beforeRaw && !Number.isNaN(new Date(beforeRaw).getTime()) ? new Date(beforeRaw) : undefined;
  res.json(await messaging.listMessages(currentUser(req), param(req, "id"), limit, before));
}

export async function sendMessage(req: Request, res: Response) {
  res.status(201).json(await messaging.sendMessage(currentUser(req), param(req, "id"), parseBody(req, messageCreateSchema).body));
}
