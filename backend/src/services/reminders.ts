// Vaccination reminder engine (Section N.6). Replaces Redis/BullMQ with an
// in-process sweep: idempotent thanks to notification dedupe keys, so running
// it every hour, on boot, or manually from the admin endpoint is always safe.
import { prisma } from "../config/db";
import { env } from "../config/env";
import { notify } from "./notify";
import { boosterStatus, isRabiesVaccine } from "./vaccination";

export type SweepResult = {
  checked: number;
  dueSoonSent: number;
  overdueSent: number;
  superseded: number;
  scheduledReleased: number;
  ranAt: string;
};

let running: Promise<SweepResult> | null = null;

const sameVaccine = (a: string, b: string) =>
  (isRabiesVaccine(a) && isRabiesVaccine(b)) || a.trim().toLowerCase() === b.trim().toLowerCase();

async function sweep(now: Date): Promise<SweepResult> {
  const horizon = new Date(now.getTime() + env.dueSoonDays * 86_400_000);
  const records = await prisma.vaccinationRecord.findMany({
    where: { status: "VERIFIED", boosterDueDate: { not: null, lte: horizon } },
    include: {
      pet: {
        select: {
          id: true,
          name: true,
          ownerId: true,
          vaccinationRecords: {
            where: { status: "VERIFIED" },
            select: { id: true, vaccineName: true, administeredDate: true },
          },
        },
      },
    },
  });

  let dueSoonSent = 0;
  let overdueSent = 0;
  let superseded = 0;

  for (const r of records) {
    // A later administration of the same vaccine means the booster was given.
    const replaced = r.pet.vaccinationRecords.some(
      (o) => o.id !== r.id && sameVaccine(o.vaccineName, r.vaccineName) && o.administeredDate > r.administeredDate,
    );
    if (replaced) {
      superseded++;
      continue;
    }
    const status = boosterStatus(r.boosterDueDate, now);
    const due = r.boosterDueDate!.toISOString().slice(0, 10);
    if (status === "OVERDUE") {
      const n = await notify({
        userId: r.pet.ownerId,
        type: "BOOSTER_OVERDUE",
        title: `${r.pet.name}'s ${r.vaccineName} booster is overdue`,
        message: `The booster was due on ${due}. Please visit a registered veterinary clinic as soon as possible.`,
        link: `/app/pets/${r.pet.id}`,
        dedupeKey: `vax:${r.id}:overdue`,
      });
      if (n) overdueSent++;
    } else if (status === "DUE_SOON") {
      const n = await notify({
        userId: r.pet.ownerId,
        type: "VACCINATION_REMINDER",
        title: `${r.pet.name}'s ${r.vaccineName} booster is due soon`,
        message: `The booster is due on ${due}. Book a visit with your vet before the due date.`,
        link: `/app/pets/${r.pet.id}`,
        dedupeKey: `vax:${r.id}:due`,
      });
      if (n) dueSoonSent++;
    }
  }

  const released = await prisma.notification.updateMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    data: { status: "SENT", sentAt: now },
  });

  return {
    checked: records.length,
    dueSoonSent,
    overdueSent,
    superseded,
    scheduledReleased: released.count,
    ranAt: now.toISOString(),
  };
}

/** Runs one sweep; concurrent callers share the in-flight run. */
export function runReminderSweep(now = new Date()): Promise<SweepResult> {
  running ??= sweep(now).finally(() => {
    running = null;
  });
  return running;
}

const g = globalThis as unknown as { __rtnReminderTimer?: NodeJS.Timeout };

export function startReminderScheduler() {
  if (g.__rtnReminderTimer) return;
  const intervalMs = Math.max(1, env.reminderIntervalMinutes) * 60_000;
  const tick = () =>
    runReminderSweep()
      .then((r) => {
        if (r.dueSoonSent || r.overdueSent) {
          console.log(`[reminders] sent ${r.dueSoonSent} due-soon, ${r.overdueSent} overdue (checked ${r.checked})`);
        }
      })
      .catch((err) => console.error("[reminders] sweep failed", err));
  setTimeout(tick, 5_000);
  g.__rtnReminderTimer = setInterval(tick, intervalMs);
  g.__rtnReminderTimer.unref?.();
}
