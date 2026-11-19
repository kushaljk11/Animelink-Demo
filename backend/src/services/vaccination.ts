// Vaccination status derivation (Section H.6 / L.9). Status is computed at read
// time from the booster date so it can never drift out of sync with the clock.
import type { VaccinationRecord } from "@prisma/client";
import { env } from "../config/env";

export type BoosterStatus = "UP_TO_DATE" | "DUE_SOON" | "OVERDUE" | "NO_BOOSTER";
export type PetVaccinationStatus = BoosterStatus | "PENDING_VERIFICATION" | "NOT_VACCINATED";

const DAY = 86_400_000;
const RABIES_PATTERN = /rabi|rabisin|raksharab|defensor|anti[\s-]?rabies|nobivac\s*rabies/i;

export function isRabiesVaccine(name: string): boolean {
  return RABIES_PATTERN.test(name);
}

export function boosterStatus(boosterDueDate: Date | null | undefined, now = new Date(), dueSoonDays = env.dueSoonDays): BoosterStatus {
  if (!boosterDueDate) return "NO_BOOSTER";
  const diff = boosterDueDate.getTime() - now.getTime();
  if (diff < 0) return "OVERDUE";
  if (diff <= dueSoonDays * DAY) return "DUE_SOON";
  return "UP_TO_DATE";
}

export function daysUntil(date: Date | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - now.getTime()) / DAY);
}

const SEVERITY_ORDER: BoosterStatus[] = ["OVERDUE", "DUE_SOON", "UP_TO_DATE", "NO_BOOSTER"];

function normalizeVaccine(name: string) {
  return isRabiesVaccine(name) ? "rabies" : name.trim().toLowerCase().replace(/\s+/g, " ");
}

type Rec = Pick<VaccinationRecord, "id" | "vaccineName" | "administeredDate" | "boosterDueDate" | "status">;

export type VaccineLine = {
  vaccine: string;
  latestRecordId: string;
  administeredDate: Date;
  boosterDueDate: Date | null;
  status: BoosterStatus;
  daysUntilDue: number | null;
};

export type PetVaccinationSummary = {
  status: PetVaccinationStatus;
  rabies: VaccineLine | null;
  vaccines: VaccineLine[];
  pendingCount: number;
  nextDue: Date | null;
};

/**
 * Only VERIFIED records count. For each vaccine the latest administration wins
 * (a later booster supersedes the earlier record's due date). Overall status is
 * the worst line.
 */
export function summarizeVaccinations(records: Rec[], now = new Date()): PetVaccinationSummary {
  const verified = records.filter((r) => r.status === "VERIFIED");
  const pendingCount = records.filter((r) => r.status === "PENDING_VERIFICATION").length;
  const latest = new Map<string, Rec>();
  for (const r of verified) {
    const k = normalizeVaccine(r.vaccineName);
    const cur = latest.get(k);
    if (!cur || r.administeredDate > cur.administeredDate) latest.set(k, r);
  }
  const vaccines: VaccineLine[] = [...latest.entries()].map(([k, r]) => ({
    vaccine: k === "rabies" ? "Rabies" : r.vaccineName,
    latestRecordId: r.id,
    administeredDate: r.administeredDate,
    boosterDueDate: r.boosterDueDate,
    status: boosterStatus(r.boosterDueDate, now),
    daysUntilDue: daysUntil(r.boosterDueDate, now),
  }));
  vaccines.sort((a, b) => SEVERITY_ORDER.indexOf(a.status) - SEVERITY_ORDER.indexOf(b.status));

  let status: PetVaccinationStatus;
  if (vaccines.length) status = vaccines[0]!.status;
  else status = pendingCount ? "PENDING_VERIFICATION" : "NOT_VACCINATED";

  const dues = vaccines.map((v) => v.boosterDueDate).filter((d): d is Date => !!d);
  return {
    status,
    rabies: vaccines.find((v) => v.vaccine === "Rabies") ?? null,
    vaccines,
    pendingCount,
    nextDue: dues.length ? new Date(Math.min(...dues.map((d) => d.getTime()))) : null,
  };
}
