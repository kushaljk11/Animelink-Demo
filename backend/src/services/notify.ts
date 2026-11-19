import { Prisma, type NotificationType } from "@prisma/client";
import { prisma } from "../config/db";

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  /** When set, a second notification with the same key is silently skipped. */
  dedupeKey?: string;
  scheduledAt?: Date;
};

/**
 * Delivers an in-app notification. Local-first build: delivery = persisting a
 * SENT row the notification drawer reads. Future-dated items stay SCHEDULED and
 * are released by the reminder sweep.
 */
export async function notify(input: NotifyInput) {
  const now = new Date();
  const future = input.scheduledAt && input.scheduledAt > now;
  try {
    return await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        dedupeKey: input.dedupeKey ?? null,
        scheduledAt: input.scheduledAt ?? now,
        status: future ? "SCHEDULED" : "SENT",
        sentAt: future ? null : now,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
    throw err;
  }
}
