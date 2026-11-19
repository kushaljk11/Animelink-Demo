import { Router } from "express";
import * as stats from "../controllers/stats.controller";
import { requireAuth, requireRole } from "../middleware/auth";

/** Dashboards, reports, audit trail and search. */
export const statsRoutes = Router()
  .get("/stats/overview", requireAuth, stats.overview)
  .get("/stats/wards", requireRole(["WARD_OFFICER"]), stats.wards)
  .get("/public/stats", stats.publicStats)
  .get("/nav-counts", requireAuth, stats.navCounts)
  .get("/ai/metrics", requireRole(["WARD_OFFICER"]), stats.aiMetrics)
  .get("/reports/export", requireAuth, stats.exportReport) // per-dataset role check in the service
  .get("/audit", requireRole(["WARD_OFFICER"]), stats.auditLog)
  .get("/search", requireAuth, stats.search);
