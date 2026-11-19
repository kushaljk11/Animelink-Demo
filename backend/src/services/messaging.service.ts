// In-app notifications and owner ↔ vet chat (Sections H.17, P.8).
import { NotificationType, type Prisma } from "@prisma/client";
import { prisma } from "../config/db";
import { badRequest, boolParam, enumFilter, forbidden, notFound, paginated, type ListParams } from "../utils/http";
import type { SessionUser } from "./auth.service";
import { notify } from "./notify";

// ------------------------------------------------------------ notifications

export async function listNotifications(user: SessionUser, p: ListParams) {
  const unread = boolParam(p.sp, "unread");
  const types = enumFilter(p.sp.get("type")?.split(","), NotificationType, "type");
  const where: Prisma.NotificationWhereInput = {
    userId: user.id,
    status: { in: ["SENT", "READ"] },
    ...(unread ? { readAt: null } : {}),
    ...(types ? { type: { in: types } } : {}),
  };
  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: [p.orderBy, { scheduledAt: "desc" }], skip: p.skip, take: p.take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, status: "SENT", readAt: null } }),
  ]);
  return { data: rows, meta: { page: p.page, limit: p.limit, total, pageCount: Math.max(1, Math.ceil(total / p.limit)), unreadCount } };
}

export async function setRead(user: SessionUser, id: string, read: boolean) {
  const n = await prisma.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) throw notFound("Notification");
  return prisma.notification.update({ where: { id }, data: read ? { readAt: n.readAt ?? new Date(), status: "READ" } : { readAt: null, status: "SENT" } });
}

export async function deleteNotification(user: SessionUser, id: string) {
  const res = await prisma.notification.deleteMany({ where: { id, userId: user.id } });
  if (!res.count) throw notFound("Notification");
}

export async function readAll(user: SessionUser) {
  const res = await prisma.notification.updateMany({ where: { userId: user.id, status: "SENT", readAt: null }, data: { readAt: new Date(), status: "READ" } });
  return { updated: res.count };
}

// --------------------------------------------------------------------- chat

export async function listConversations(user: SessionUser, p: ListParams) {
  let where: Prisma.ConversationWhereInput;
  if (user.role === "PET_OWNER") where = { ownerId: user.id };
  else if (user.role === "VET_CLINIC" && user.clinicId) where = { clinicId: user.clinicId };
  else if (user.role === "ADMIN") where = {};
  else throw forbidden("Chat is available to pet owners and veterinary clinics");
  if (p.query) {
    const ci = { contains: p.query, mode: "insensitive" as const };
    where = { AND: [where, { OR: [{ subject: ci }, { pet: { name: ci } }, { owner: { fullName: ci } }] }] };
  }
  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: p.orderBy,
      skip: p.skip,
      take: p.take,
      include: {
        owner: { select: { id: true, fullName: true } },
        clinic: { select: { id: true, clinicName: true, userId: true } },
        pet: { select: { id: true, name: true, photoUrl: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.conversation.count({ where }),
  ]);
  const unread = await prisma.chatMessage.groupBy({
    by: ["conversationId"],
    where: { conversationId: { in: rows.map((r) => r.id) }, readAt: null, senderId: { not: user.id } },
    _count: { _all: true },
  });
  const unreadMap = new Map(unread.map((u) => [u.conversationId, u._count._all]));
  return paginated(
    rows.map(({ messages, ...c }) => ({ ...c, lastMessage: messages[0] ?? null, unreadCount: unreadMap.get(c.id) ?? 0 })),
    total,
    p,
  );
}

export async function startConversation(user: SessionUser, body: { clinicId: string; petId?: string | null; subject?: string | null; message: string }) {
  const clinic = await prisma.veterinaryClinic.findUnique({ where: { id: body.clinicId } });
  if (!clinic || clinic.verificationStatus !== "VERIFIED") throw notFound("Clinic");
  if (body.petId) {
    const pet = await prisma.pet.findUnique({ where: { id: body.petId }, select: { ownerId: true } });
    if (!pet || (pet.ownerId !== user.id && user.role !== "ADMIN")) throw badRequest("Pet not found among your pets");
  }
  const petId = body.petId ?? null;
  const conversation =
    (await prisma.conversation.findFirst({ where: { ownerId: user.id, clinicId: clinic.id, petId } })) ??
    (await prisma.conversation.create({ data: { ownerId: user.id, clinicId: clinic.id, petId, subject: body.subject ?? null } }));
  const message = await prisma.chatMessage.create({ data: { conversationId: conversation.id, senderId: user.id, body: body.message } });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  await notify({ userId: clinic.userId, type: "CHAT_MESSAGE", title: `New message from ${user.fullName}`, message: body.message.slice(0, 140), link: `/app/chat/${conversation.id}` });
  return { conversation, message };
}

async function participantConversation(user: SessionUser, id: string) {
  const c = await prisma.conversation.findUnique({
    where: { id },
    include: { clinic: { select: { id: true, clinicName: true, userId: true } }, owner: { select: { id: true, fullName: true } }, pet: { select: { id: true, name: true } } },
  });
  if (!c) throw notFound("Conversation");
  if (c.ownerId !== user.id && c.clinic.userId !== user.id && user.role !== "ADMIN") throw forbidden("You are not part of this conversation");
  return c;
}

export async function listMessages(user: SessionUser, id: string, limit: number, before?: Date) {
  const c = await participantConversation(user, id);
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId: c.id, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { sender: { select: { id: true, fullName: true, role: true } } },
  });
  if (user.role !== "ADMIN") {
    await prisma.chatMessage.updateMany({ where: { conversationId: c.id, senderId: { not: user.id }, readAt: null }, data: { readAt: new Date() } });
  }
  return { conversation: c, messages: messages.reverse(), hasMore: messages.length === limit };
}

export async function sendMessage(user: SessionUser, id: string, body: string) {
  const c = await participantConversation(user, id);
  if (c.ownerId !== user.id && c.clinic.userId !== user.id) throw forbidden("Only participants can send messages");
  const message = await prisma.chatMessage.create({ data: { conversationId: c.id, senderId: user.id, body }, include: { sender: { select: { id: true, fullName: true, role: true } } } });
  await prisma.conversation.update({ where: { id: c.id }, data: { updatedAt: new Date() } });
  await notify({
    userId: c.ownerId === user.id ? c.clinic.userId : c.ownerId,
    type: "CHAT_MESSAGE",
    title: `New message from ${c.ownerId === user.id ? c.owner.fullName : c.clinic.clinicName}`,
    message: body.slice(0, 140),
    link: `/app/chat/${c.id}`,
  });
  return message;
}
