// Input validation boundaries (Sections U "Input Validation", Y.5).
import { describe, expect, it } from "vitest";
import {
  cnvrCreateSchema,
  incidentCreateSchema,
  nearbyQuerySchema,
  petCreateSchema,
  qrScanSchema,
  registerSchema,
  vaccinationCreateSchema,
} from "@/validators";

const DAY = 86_400_000;
const validIncident = {
  animalType: "DOG",
  severity: "HIGH",
  description: "Dog bit a child near the bus stop.",
  incidentDate: new Date(Date.now() - DAY).toISOString(),
  latitude: 27.6936,
  longitude: 85.2818,
};
const issuesFor = (r: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.path.join("."));

describe("incidentCreateSchema", () => {
  it("accepts a minimal valid report and defaults suspectedRabies=false", () => {
    const r = incidentCreateSchema.safeParse(validIncident);
    expect(r.success).toBe(true);
    expect(r.success && r.data.suspectedRabies).toBe(false);
  });

  it.each([
    ["empty description", { description: "" }, "description"],
    ["whitespace-padded short description", { description: "   bit me   " }, "description"],
    ["description over 2000 chars", { description: "x".repeat(2001) }, "description"],
    ["unknown animal enum", { animalType: "WOLF" }, "animalType"],
    ["lower-case enum", { severity: "high" }, "severity"],
    ["latitude north of Nepal", { latitude: 30.51 }, "latitude"],
    ["latitude south of Nepal", { latitude: 26.29 }, "latitude"],
    ["longitude west of Nepal", { longitude: 79.99 }, "longitude"],
    ["New York coordinates", { latitude: 40.7128, longitude: -74.006 }, "latitude"],
    ["non-numeric latitude", { latitude: "north" }, "latitude"],
    ["future incident date", { incidentDate: new Date(Date.now() + DAY).toISOString() }, "incidentDate"],
    ["incident older than a year", { incidentDate: new Date(Date.now() - 400 * DAY).toISOString() }, "incidentDate"],
    ["external photo URL", { photoUrl: "https://evil.example/x.png" }, "photoUrl"],
    ["photo path traversal", { photoUrl: "/uploads/incidents/../../package.json" }, "photoUrl"],
    ["photo from another upload kind", { photoUrl: "/uploads/pets/abc.webp" }, "photoUrl"],
    ["invalid phone", { reporterPhone: "12345" }, "reporterPhone"],
    ["ward 0", { wardNumber: 0 }, "wardNumber"],
    ["ward 36", { wardNumber: 36 }, "wardNumber"],
  ])("rejects %s", (_label, patch, field) => {
    const r = incidentCreateSchema.safeParse({ ...validIncident, ...patch });
    expect(r.success).toBe(false);
    expect(issuesFor(r)).toContain(field);
  });

  it("accepts Nepal boundary coordinates and coerces numeric strings", () => {
    expect(incidentCreateSchema.safeParse({ ...validIncident, latitude: 26.3, longitude: 80.0 }).success).toBe(true);
    expect(incidentCreateSchema.safeParse({ ...validIncident, latitude: 30.5, longitude: 88.3 }).success).toBe(true);
    const r = incidentCreateSchema.safeParse({ ...validIncident, latitude: "27.7", longitude: "85.3" });
    expect(r.success && r.data.latitude).toBe(27.7);
  });

  it.each(["9841234567", "+977-9841234567", "977 9761234567", "+977 984 123 4567"])("accepts and normalises Nepali mobile %s", (phone) => {
    const r = incidentCreateSchema.safeParse({ ...validIncident, reporterPhone: phone });
    expect(r.success).toBe(true);
    expect(r.success && r.data.reporterPhone).toMatch(/^9[78]\d{8}$/);
  });

  it.each(["01-4123456", "014123456", "9641234567", "984123456"])("rejects non-mobile number %s for public reports (SMS follow-up)", (phone) => {
    expect(incidentCreateSchema.safeParse({ ...validIncident, reporterPhone: phone }).success).toBe(false);
  });

  it("trims text and turns empty optional strings into null", () => {
    const r = incidentCreateSchema.safeParse({ ...validIncident, description: "   Dog bit a child near the bus stop.  ", address: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.description).toBe("Dog bit a child near the bus stop.");
      expect(r.data.address).toBeNull();
    }
  });
});

describe("registerSchema", () => {
  const base = { fullName: "Test User", email: "  Test.User@Example.COM ", password: "Secret123" };

  it("normalises email to lower case and defaults role to PET_OWNER", () => {
    const r = registerSchema.safeParse(base);
    expect(r.success && r.data.email).toBe("test.user@example.com");
    expect(r.success && r.data.role).toBe("PET_OWNER");
  });

  it.each([
    ["short", "Ab1"],
    ["no uppercase", "secret123"],
    ["no lowercase", "SECRET123"],
    ["no digit", "SecretPass"],
  ])("rejects a weak password (%s)", (_l, password) => {
    expect(issuesFor(registerSchema.safeParse({ ...base, password }))).toContain("password");
  });

  it("does not allow self-registration as WARD_OFFICER or ADMIN", () => {
    expect(registerSchema.safeParse({ ...base, role: "WARD_OFFICER" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, role: "ADMIN" }).success).toBe(false);
  });

  it("requires clinic details for VET_CLINIC accounts", () => {
    expect(issuesFor(registerSchema.safeParse({ ...base, role: "VET_CLINIC" }))).toContain("clinic");
  });
});

describe("vaccinationCreateSchema", () => {
  const v = { petId: "p1", vaccineName: "Rabisin", batchNumber: "RB26A1", administeredDate: new Date(Date.now() - DAY).toISOString() };
  it("rejects a booster due before the administered date", () => {
    expect(issuesFor(vaccinationCreateSchema.safeParse({ ...v, boosterDueDate: new Date(Date.now() - 2 * DAY).toISOString() }))).toContain("boosterDueDate");
  });
  it("rejects a future administered date", () => {
    expect(issuesFor(vaccinationCreateSchema.safeParse({ ...v, administeredDate: new Date(Date.now() + DAY).toISOString() }))).toContain("administeredDate");
  });
  it("defaults verify=false", () => {
    const r = vaccinationCreateSchema.safeParse(v);
    expect(r.success && r.data.verify).toBe(false);
  });
});

describe("cnvrCreateSchema", () => {
  it("requires at least one of vaccination / sterilisation / release", () => {
    expect(cnvrCreateSchema.safeParse({ strayId: "s1" }).success).toBe(false);
  });
  it("requires a vaccine name when a vaccination date is given", () => {
    expect(issuesFor(cnvrCreateSchema.safeParse({ strayId: "s1", vaccinationDate: new Date().toISOString() }))).toContain("vaccineName");
  });
  it("requires release latitude and longitude together", () => {
    expect(cnvrCreateSchema.safeParse({ strayId: "s1", sterilizationDate: new Date().toISOString(), releaseLatitude: 27.7 }).success).toBe(false);
  });
});

describe("other payloads", () => {
  it("qrScanSchema: sharing location requires coordinates", () => {
    expect(qrScanSchema.safeParse({ shareLocation: true }).success).toBe(false);
    expect(qrScanSchema.safeParse({ shareLocation: true, latitude: 27.7, longitude: 85.3 }).success).toBe(true);
    expect(qrScanSchema.safeParse({}).success).toBe(true);
  });

  it("petCreateSchema: rejects unknown species and empty names", () => {
    expect(petCreateSchema.safeParse({ name: "Momo", species: "HORSE" }).success).toBe(false);
    expect(petCreateSchema.safeParse({ name: "   ", species: "DOG" }).success).toBe(false);
  });

  it("nearbyQuerySchema: coerces query strings and bounds the radius", () => {
    const ok = nearbyQuerySchema.safeParse({ lat: "27.7", lng: "85.3", radiusKm: "5", types: "clinic" });
    expect(ok.success && ok.data).toMatchObject({ lat: 27.7, lng: 85.3, radiusKm: 5, types: ["clinic"], verifiedOnly: true });
    expect(nearbyQuerySchema.safeParse({ lat: "27.7", lng: "85.3", radiusKm: "0" }).success).toBe(false);
    expect(nearbyQuerySchema.safeParse({ lat: "27.7", lng: "85.3", radiusKm: "51" }).success).toBe(false);
    expect(nearbyQuerySchema.safeParse({ lat: "27.7", lng: "85.3", types: "clinic,hospital" }).success).toBe(false);
  });
});
