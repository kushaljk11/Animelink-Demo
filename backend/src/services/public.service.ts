// Public-facing services: citizen tracking (code or mobile), contact inquiries with SMS verification, resolved-case map.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { Prisma, type BiteIncident } from "@prisma/client";
import { prisma } from "../config/db";
import { ApiError, badRequest, notFound, rateLimit } from "../utils/http";
import { toBS } from "./date.service";
import { notify } from "./notify";
import { localMobile, sms } from "./notification.service";

// ------------------------------------------------------------ tracking codes

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I: easy to read aloud and type
const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
export const newTrackingCode = () => `NP-${block()}-${block()}`;

/** "np abcd efgh", "NPABCDEFGH", "ABCD-EFGH" → "NP-ABCD-EFGH"; null if it isn't shaped like a code. */
export function normaliseTrackingCode(input: string): string | null {
  const m = input.toUpperCase().replace(/[\s_]/g, "").match(/^(?:NP-?)?([A-Z0-9]{4})-?([A-Z0-9]{4})$/);
  return m ? `NP-${m[1]}-${m[2]}` : null;
}

/** Create with a fresh code, retrying on the (astronomically rare) unique collision. */
export async function withTrackingCode<T>(create: (code: string) => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await create(newTrackingCode());
    } catch (err) {
      const target = (err as Prisma.PrismaClientKnownRequestError).meta?.target;
      const isCode = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && String(target).includes("tracking_code");
      if (!isCode || i >= 4) throw err;
    }
  }
}

// ------------------------------------------------------------ public tracker

const STATUS_LABEL: Record<string, string> = { REPORTED: "Reported", UNDER_REVIEW: "Under review", VERIFIED: "Verified", RESOLVED: "Resolved", DISMISSED: "Dismissed" };
const PUBLIC_STEPS = ["REPORTED", "UNDER_REVIEW", "VERIFIED", "RESOLVED"] as const;

type TrackRow = Pick<BiteIncident, "id" | "trackingCode" | "status" | "severity" | "animalType" | "suspectedRabies" | "incidentDate" | "createdAt" | "updatedAt" | "municipality" | "wardNumber" | "statusNote">;
const trackSelect = { id: true, trackingCode: true, status: true, severity: true, animalType: true, suspectedRabies: true, incidentDate: true, createdAt: true, updatedAt: true, municipality: true, wardNumber: true, statusNote: true } as const;

/**
 * Progress only: no names, phone numbers, description or exact location.
 * `includeNotes` is true when the caller proved they hold the tracking code; a phone-number lookup omits
 * officer notes, because a phone number is far easier for someone else to know than a random code.
 */
async function publicSummary(incident: TrackRow, includeNotes: boolean) {
  const logs = await prisma.auditLog.findMany({
    where: { entityType: "BiteIncident", entityId: incident.id, action: { in: ["INCIDENT_CREATED", "INCIDENT_STATUS_CHANGED"] } },
    orderBy: { createdAt: "asc" },
    select: { action: true, after: true, createdAt: true },
  });
  const timeline = logs.map((l) => {
    let after: { status?: string; note?: string | null } = {};
    try {
      after = l.after ? (JSON.parse(l.after) as typeof after) : {};
    } catch {
      after = {};
    }
    const status = l.action === "INCIDENT_CREATED" ? "REPORTED" : (after.status ?? "UPDATED");
    const note = l.action === "INCIDENT_CREATED" ? "Report received by the ward office." : includeNotes ? (after.note ?? null) : null;
    return { status, label: STATUS_LABEL[status] ?? status, note, at: l.createdAt, atBS: toBS(l.createdAt) };
  });
  if (!timeline.length) timeline.push({ status: "REPORTED", label: "Reported", note: "Report received by the ward office.", at: incident.createdAt, atBS: toBS(incident.createdAt) });
  return {
    code: incident.trackingCode,
    status: incident.status,
    statusLabel: STATUS_LABEL[incident.status],
    severity: incident.severity,
    animalType: incident.animalType,
    suspectedRabies: incident.suspectedRabies,
    incidentDate: incident.incidentDate,
    submittedAt: incident.createdAt,
    lastUpdated: incident.updatedAt,
    area: [incident.wardNumber ? `Ward ${incident.wardNumber}` : null, incident.municipality].filter(Boolean).join(", ") || null,
    latestNote: includeNotes ? incident.statusNote : null,
    steps: incident.status === "DISMISSED" ? ["REPORTED", "UNDER_REVIEW", "DISMISSED"] : PUBLIC_STEPS,
    timeline,
  };
}

/** Legacy + code lookup used by /public/incidents/:code (accepts NP-XXXX-XXXX or the old internal id). */
export async function trackByCode(raw: string) {
  const code = normaliseTrackingCode(raw);
  const where = code ? { trackingCode: code } : /^[a-z0-9]{20,40}$/i.test(raw) ? { id: raw } : null;
  if (!where) throw notFound("Report");
  const incident = await prisma.biteIncident.findUnique({ where: where as Prisma.BiteIncidentWhereUniqueInput, select: trackSelect });
  if (!incident) throw notFound("Report");
  return publicSummary(incident, true);
}

/** GET /public/track?query= — a tracking code, or the 10-digit mobile used when reporting. */
export async function track(query: string, ip: string) {
  const code = normaliseTrackingCode(query);
  if (code) {
    rateLimit(`track:${ip}`, 30, 10 * 60_000);
    return { matchedBy: "code" as const, results: [await trackByCode(code)] };
  }
  const mobile = localMobile(query);
  if (!mobile) throw badRequest("Enter a tracking code (NP-XXXX-XXXX) or the 10-digit mobile number you reported with (98XXXXXXXX)");
  // Stricter: phone numbers are guessable, so fewer lookups per IP and per number.
  rateLimit(`track-phone:${ip}`, 10, 10 * 60_000);
  rateLimit(`track-phone-n:${mobile}`, 20, 60 * 60_000);
  const variants = [mobile, `+977${mobile}`, `+977-${mobile}`, `+977 ${mobile}`, `977${mobile}`];
  const rows = await prisma.biteIncident.findMany({
    where: { OR: [{ reporterPhone: { in: variants } }, { reportedBy: { phone: { in: variants } } }] },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: trackSelect,
  });
  if (!rows.length) throw notFound("Report for that number");
  return { matchedBy: "phone" as const, results: await Promise.all(rows.map((r) => publicSummary(r, false))) };
}

// ------------------------------------------------------------ contact form: SMS one-time code

const OTP_TTL_MS = 10 * 60_000;
const otps = new Map<string, { hash: Buffer; expires: number; attempts: number }>();
const sha = (s: string) => createHash("sha256").update(s).digest();

/** Sends a 6-digit code by SMS (printed to the console in development). In-memory: single-instance local deployment. */
export async function requestOtp(phone: string, ip: string) {
  const mobile = localMobile(phone);
  if (!mobile) throw badRequest("Enter a 10-digit Nepali mobile number");
  rateLimit(`otp-ip:${ip}`, 10, 60 * 60_000);
  rateLimit(`otp:${mobile}`, 3, 15 * 60_000);
  const code = String(randomInt(100_000, 1_000_000));
  otps.set(mobile, { hash: sha(`${mobile}:${code}`), expires: Date.now() + OTP_TTL_MS, attempts: 0 });
  for (const [k, v] of otps) if (v.expires < Date.now()) otps.delete(k);
  const sent = await sms(mobile, "contact.otp", `your verification code is ${code}. It expires in 10 minutes. Never share it.`);
  if (!sent.ok) {
    otps.delete(mobile);
    throw new ApiError(503, "We couldn’t send the SMS right now. Please try again in a few minutes", "SMS_UNAVAILABLE");
  }
  return { sent: true, expiresInSeconds: OTP_TTL_MS / 1000, to: `${mobile.slice(0, 3)}****${mobile.slice(-3)}` };
}

function verifyOtp(mobile: string, code: string) {
  const entry = otps.get(mobile);
  if (!entry || entry.expires < Date.now()) throw badRequest("The verification code has expired. Request a new one");
  if (++entry.attempts > 5) {
    otps.delete(mobile);
    throw badRequest("Too many wrong attempts. Request a new code");
  }
  const ok = timingSafeEqual(entry.hash, sha(`${mobile}:${code}`));
  if (!ok) throw badRequest("That verification code is not correct");
  otps.delete(mobile); // single use
}

export async function createInquiry(body: { name: string; phone: string; email?: string | null; topic: string; message: string; otp: string }, ip: string) {
  const mobile = localMobile(body.phone);
  if (!mobile) throw badRequest("Enter a 10-digit Nepali mobile number");
  rateLimit(`inquiry:${ip}`, 5, 60 * 60_000);
  verifyOtp(mobile, body.otp);
  const inquiry = await prisma.inquiry.create({ data: { name: body.name, phone: mobile, email: body.email ?? null, topic: body.topic, message: body.message, phoneVerified: true } });
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
  for (const a of admins) {
    await notify({ userId: a.id, type: "ACCOUNT", title: `New inquiry: ${body.topic.toLowerCase().replace(/_/g, " ")}`, message: `${body.name} (${mobile}, verified): ${body.message.slice(0, 200)}`, link: "/app/inquiries" });
  }
  await sms(mobile, "contact.received", `we received your message (ref ${inquiry.id.slice(-6).toUpperCase()}). Our team will reply within 2 working days.`);
  return { id: inquiry.id, reference: inquiry.id.slice(-6).toUpperCase(), createdAt: inquiry.createdAt };
}

export async function listInquiries(page: number, limit: number, status?: string) {
  const where = status ? { status } : {};
  const [data, total] = await Promise.all([
    prisma.inquiry.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.inquiry.count({ where }),
  ]);
  return { data, meta: { page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)) } };
}

export async function setInquiryStatus(id: string, status: "NEW" | "RESOLVED") {
  const found = await prisma.inquiry.findUnique({ where: { id } });
  if (!found) throw notFound("Inquiry");
  return prisma.inquiry.update({ where: { id }, data: { status } });
}

// ------------------------------------------------------------ landing-page map

/** Recently resolved cases at ~1 km precision (2 decimals) for the public map: no ids, notes or people. */
export async function resolvedMilestones(days = 120) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.biteIncident.findMany({
    where: { status: "RESOLVED", updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    take: 150,
    select: { latitude: true, longitude: true, animalType: true, municipality: true, wardNumber: true, updatedAt: true, incidentDate: true },
  });
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    days,
    total: rows.length,
    data: rows.map((r) => ({
      lat: round(r.latitude),
      lng: round(r.longitude),
      animalType: r.animalType,
      area: [r.wardNumber ? `Ward ${r.wardNumber}` : null, r.municipality].filter(Boolean).join(", ") || null,
      resolvedAt: r.updatedAt,
      resolvedAtBS: toBS(r.updatedAt),
      daysToResolve: Math.max(0, Math.round((r.updatedAt.getTime() - r.incidentDate.getTime()) / 86_400_000)),
    })),
  };
}
