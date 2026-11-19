import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import * as analytics from "../services/analytics.service";
import { audit } from "../services/audit";
import * as reports from "../services/report.service";
import { parseList, parseQuery } from "../utils/http";
import { exportQuerySchema, searchQuerySchema, statsQuerySchema } from "../validators";

export async function overview(req: Request, res: Response) {
  const q = parseQuery(req, statsQuerySchema);
  res.json(await analytics.overview(currentUser(req), q.days, q.municipality));
}

export async function wards(req: Request, res: Response) {
  const q = parseQuery(req, statsQuerySchema);
  res.json(await analytics.wardStats(currentUser(req), q.days, q.municipality));
}

export async function publicStats(_req: Request, res: Response) {
  res.set("Cache-Control", "public, max-age=60").json(await analytics.publicStats());
}

export async function navCounts(req: Request, res: Response) {
  res.json(await analytics.navCounts(currentUser(req)));
}

export async function aiMetrics(_req: Request, res: Response) {
  res.json(await analytics.aiMetrics());
}

/** GET /api/reports/export?entity=…&format=csv|pdf — every export is audited. */
export async function exportReport(req: Request, res: Response) {
  const user = currentUser(req);
  const q = parseQuery(req, exportQuerySchema);
  const out = await reports.exportReport(user, q);
  await audit({
    actorId: user.id,
    action: "REPORT_EXPORTED",
    entityType: "Report",
    entityId: q.entity,
    after: { format: q.format, rows: out.rowCount, from: q.from, to: q.to, status: q.status, municipality: q.municipality, wardNumber: q.wardNumber },
    req,
  });
  res.set({ "Content-Type": out.contentType, "Content-Disposition": `attachment; filename="${out.filename}"`, "Cache-Control": "no-store" }).send(out.body);
}

export async function auditLog(req: Request, res: Response) {
  res.json(await reports.listAudit(currentUser(req), parseList(req, ["createdAt", "action", "entityType"], "createdAt")));
}

export async function search(req: Request, res: Response) {
  const { q, limit } = parseQuery(req, searchQuerySchema);
  res.json(await reports.search(currentUser(req), q, limit));
}
