import { Router } from "express";
import * as messaging from "../controllers/messaging.controller";
import * as platform from "../controllers/platform.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { imageUpload } from "../middleware/upload";

/** Notifications, owner↔vet chat, AI, uploads and health. */
export const platformRoutes = Router()
  .get("/health", platform.health)
  // notifications
  .get("/notifications", requireAuth, messaging.listNotifications)
  .post("/notifications/read-all", requireAuth, messaging.readAll)
  .post("/notifications/reminders", requireRole(["ADMIN"]), messaging.runReminders)
  .patch("/notifications/:id", requireAuth, messaging.updateNotification)
  .delete("/notifications/:id", requireAuth, messaging.deleteNotification)
  // chat
  .get("/conversations", requireAuth, messaging.listConversations)
  .post("/conversations", requireRole(["PET_OWNER"]), messaging.startConversation)
  .get("/conversations/:id/messages", requireAuth, messaging.listMessages)
  .post("/conversations/:id/messages", requireAuth, messaging.sendMessage)
  // AI
  .post("/ai/breed", requireAuth, imageUpload.single("file"), platform.predictBreed)
  .patch("/ai/breed/:id", requireAuth, platform.confirmBreed)
  .post("/ai/chat", platform.chat)
  .patch("/ai/chat/:id", platform.rateChat)
  // uploads
  .post("/uploads", imageUpload.single("file"), platform.upload);

/** Mounted at the server root (not /api): GET /uploads/<kind>/<file>. */
export const fileRoutes = Router().get("/uploads/*path", platform.serveUpload);
