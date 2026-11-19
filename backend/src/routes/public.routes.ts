import { Router } from "express";
import * as pub from "../controllers/public.controller";
import { requireRole } from "../middleware/auth";

/** Citizen-facing endpoints for the marketing site and tracker (rate-limited inside the services). */
export const publicRoutes = Router()
  .get("/public/track", pub.track)
  .get("/public/milestones", pub.milestones)
  .post("/public/otp", pub.requestOtp)
  .post("/public/inquiries", pub.createInquiry)
  .get("/__test/outbox", pub.testOutbox)
  .get("/inquiries", requireRole(["ADMIN"]), pub.listInquiries)
  .patch("/inquiries/:id", requireRole(["ADMIN"]), pub.setInquiryStatus);
