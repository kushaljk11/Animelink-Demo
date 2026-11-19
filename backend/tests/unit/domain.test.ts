// Vaccination status derivation, chatbot safety rules and the rate limiter.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reply, scrubPii } from "@/services/ai/chatbot";
import { ApiError, rateLimit } from "@/utils/http";
import { boosterStatus, isRabiesVaccine, summarizeVaccinations } from "@/services/vaccination";
import { testDatabaseUrl } from "../integration/global-setup";

const DAY = 86_400_000;
const NOW = new Date("2026-11-09T12:00:00Z");
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

describe("boosterStatus (Up to Date / Due Soon / Overdue)", () => {
  it.each([
    [null, "NO_BOOSTER"],
    [at(31), "UP_TO_DATE"],
    [at(30), "DUE_SOON"],
    [at(1), "DUE_SOON"],
    [at(0), "DUE_SOON"],
    [new Date(NOW.getTime() - 1), "OVERDUE"],
    [at(-200), "OVERDUE"],
  ] as const)("%s → %s", (due, expected) => {
    expect(boosterStatus(due, NOW, 30)).toBe(expected);
  });
});

describe("summarizeVaccinations", () => {
  const rec = (id: string, vaccineName: string, adminDays: number, status = "VERIFIED") => ({
    id,
    vaccineName,
    administeredDate: at(adminDays),
    boosterDueDate: at(adminDays + 365),
    status: status as "VERIFIED" | "PENDING_VERIFICATION" | "REVOKED",
  });

  it("uses the latest dose per vaccine (a later booster supersedes an overdue one)", () => {
    const s = summarizeVaccinations([rec("old", "Rabisin (Rabies)", -500), rec("new", "Nobivac Rabies", -30)], NOW);
    expect(s.rabies?.latestRecordId).toBe("new");
    expect(s.status).toBe("UP_TO_DATE");
  });

  it("reports the worst status across vaccines", () => {
    const s = summarizeVaccinations([rec("r", "Raksharab", -30), rec("d", "Nobivac DHPPi", -400)], NOW);
    expect(s.status).toBe("OVERDUE");
    expect(s.vaccines[0]!.status).toBe("OVERDUE");
  });

  it("ignores revoked and pending records when deriving status", () => {
    expect(summarizeVaccinations([rec("x", "Rabisin", -30, "REVOKED")], NOW).status).toBe("NOT_VACCINATED");
    const pending = summarizeVaccinations([rec("p", "Rabisin", -30, "PENDING_VERIFICATION")], NOW);
    expect(pending.status).toBe("PENDING_VERIFICATION");
    expect(pending.pendingCount).toBe(1);
  });

  it("recognises rabies vaccine brand names", () => {
    for (const n of ["Rabisin (Rabies)", "Nobivac Rabies", "Raksharab", "Defensor 3", "Anti-Rabies"]) expect(isRabiesVaccine(n)).toBe(true);
    expect(isRabiesVaccine("Nobivac DHPPi")).toBe(false);
  });
});

describe("chatbot safety (Section T.3)", () => {
  it("escalates any bite exposure to professional help", () => {
    const r = reply("A street dog bit my hand, what should I do?");
    expect(r.intent).toBe("safety_bite_exposure");
    expect(r.safetyEscalated).toBe(true);
    expect(r.answer).toMatch(/15 minutes/);
    expect(r.answer).toMatch(/hospital/i);
  });

  it("refuses to diagnose rabies", () => {
    const r = reply("Does my dog have rabies? He is drooling");
    expect(r.intent).toBe("safety_no_diagnosis");
    expect(r.safetyEscalated).toBe(true);
    expect(r.answer).toMatch(/can't diagnose/i);
  });

  it("combines both refusals when a bite question also asks for a diagnosis", () => {
    const r = reply("The dog that bit me — is it rabid?");
    expect(r.intent).toBe("safety_bite_exposure");
    expect(r.answer).toMatch(/can't tell you whether the animal has rabies/);
  });

  it("detects Nepali and answers in Nepali", () => {
    const bite = reply("कुकुरले टोक्यो");
    expect(bite.locale).toBe("NE");
    expect(bite.safetyEscalated).toBe(true);
    const lost = reply("मेरो कुकुर हरायो");
    expect(lost.intent).toBe("lost_pet");
    expect(lost.locale).toBe("NE");
  });

  it("routes ordinary questions without escalation and falls back gracefully", () => {
    expect(reply("How do QR tags work?").intent).toBe("qr_how");
    const fb = reply("asdf qwerty");
    expect(fb.intent).toBe("fallback");
    expect(fb.safetyEscalated).toBe(false);
  });

  it("scrubs phone numbers and emails before logging", () => {
    expect(scrubPii("call 9841234567 or mail ram@example.com")).toBe("call [phone] or mail [email]");
  });
});

describe("rateLimit", () => {
  // The in-process integration harness may set a multiplier in the parent process; pin the default here.
  beforeEach(() => {
    delete process.env.RATE_LIMIT_MULTIPLIER;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.RATE_LIMIT_MULTIPLIER;
  });

  it("allows `limit` calls per window, then throws 429, then resets", () => {
    vi.useFakeTimers();
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60_000);
    let err: unknown;
    try {
      rateLimit(key, 3, 60_000);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    vi.advanceTimersByTime(60_001);
    expect(() => rateLimit(key, 3, 60_000)).not.toThrow();
  });

  it("scales limits with RATE_LIMIT_MULTIPLIER", () => {
    process.env.RATE_LIMIT_MULTIPLIER = "2";
    const key = `m:${Math.random()}`;
    for (let i = 0; i < 6; i++) rateLimit(key, 3, 60_000);
    expect(() => rateLimit(key, 3, 60_000)).toThrow(ApiError);
  });
});

describe("integration harness safety", () => {
  it("always targets a *_test database", () => {
    expect(testDatabaseUrl("postgresql://u:p@localhost:5432/rabies_track")).toBe("postgresql://u:p@localhost:5432/rabies_track_test");
    expect(testDatabaseUrl("postgresql://u:p@localhost:5432/rabies_track_test")).toBe("postgresql://u:p@localhost:5432/rabies_track_test");
    expect(testDatabaseUrl("postgresql://u:p@db:5432/x?schema=public")).toBe("postgresql://u:p@db:5432/x_test?schema=public");
  });
});

describe("Bikram Sambat conversion (date.service)", async () => {
  const { toBS, formatBS, withBSDates } = await import("../../src/services/date.service");
  it("matches known Nepali New Year dates", () => {
    expect(toBS(new Date("2023-04-14T06:00:00Z"))).toBe("2080-01-01");
    expect(toBS(new Date("2024-04-13T06:00:00Z"))).toBe("2081-01-01");
    expect(toBS(new Date("2025-04-14T06:00:00Z"))).toBe("2082-01-01");
  });
  it("uses the calendar day in Kathmandu (UTC+05:45)", () => {
    expect(toBS(new Date("2026-11-08T18:00:00Z"))).toBe(toBS(new Date("2026-11-08T06:00:00Z"))); // 23:45 NPT, same day
    expect(toBS(new Date("2026-11-08T18:30:00Z"))).toBe("2083-07-23"); // 00:15 NPT on 9 Nov
    expect(formatBS(new Date("2026-11-09T06:00:00Z"))).toBe("२०८३ कार्तिक २३");
  });
  it("adds <key>BS siblings without touching non-date values", () => {
    const out = withBSDates({ createdAt: new Date("2025-04-14T06:00:00Z"), nested: [{ at: new Date("2024-04-13T06:00:00Z"), n: 1 }], s: "x" });
    expect(out).toMatchObject({ createdAtBS: "2082-01-01", s: "x", nested: [{ atBS: "2081-01-01", n: 1 }] });
    expect(toBS(null)).toBeNull();
    expect(toBS("not a date")).toBeNull();
  });
});
