// Input sanitisation at the HTTP boundary (Sections U, Y.2, Y.4).
import { describe, expect, it } from "vitest";
import { as, Client, incidentPayload } from "./helpers";

const guest = new Client();

describe("payload validation returns structured 400 errors", () => {
  it.each([
    ["empty description", { description: "" }, "description"],
    ["coordinates outside Nepal", { latitude: 51.5, longitude: -0.12 }, "latitude"],
    ["malformed enum", { animalType: "dragon" }, "animalType"],
    ["future date", { incidentDate: new Date(Date.now() + 86_400_000).toISOString() }, "incidentDate"],
    ["foreign photo URL", { photoUrl: "http://example.com/a.png" }, "photoUrl"],
  ])("incident with %s → 400 (%s)", async (_l, patch, field) => {
    const r = await guest.post("/api/incidents", incidentPayload({ reporterPhone: "9841000010", ...patch }));
    expect(r.status).toBe(400);
    expect(r.data.error.code).toBe("VALIDATION_ERROR");
    expect(r.data.error.details.fieldErrors).toHaveProperty(field);
  });

  it("malformed JSON → 400", async () => {
    const r = await guest.req("POST", "/api/incidents", undefined, "{not json");
    expect(r.status).toBe(400);
    expect(r.data.error.message).toMatch(/valid JSON/);
  });

  it("unknown sort field → 400 (no arbitrary column access)", async () => {
    const owner = await as("PET_OWNER");
    expect((await owner.get("/api/pets?sort=passwordHash")).status).toBe(400);
  });

  it("unknown status filter → 400", async () => {
    const officer = await as("WARD_OFFICER");
    expect((await officer.get("/api/incidents?status=IN_PROGRESS")).status).toBe(400);
  });

  it("out-of-range pagination is rejected, beyond-last-page is an empty page", async () => {
    const officer = await as("WARD_OFFICER");
    expect((await officer.get("/api/incidents?limit=1000")).status).toBe(400);
    expect((await officer.get("/api/incidents?page=0")).status).toBe(400);
    const far = await officer.get("/api/incidents?page=9999");
    expect(far.status).toBe(200);
    expect(far.data.data).toEqual([]);
    expect(far.data.meta.total).toBeGreaterThan(0);
  });

  it("geo queries validate bounds", async () => {
    expect((await guest.get("/api/geo/nearby?lat=95&lng=85")).status).toBe(400);
    expect((await guest.get("/api/geo/nearby?lat=27.7&lng=85.3&radiusKm=500")).status).toBe(400);
    expect((await guest.get("/api/geo/nearby?lat=27.7&lng=85.3&types=hospital")).status).toBe(400);
  });

  it("registration enforces the password policy and blocks privileged self-registration", async () => {
    const weak = await guest.post("/api/auth/register", { fullName: "Weak", email: "weak@example.com", password: "password" });
    expect(weak.status).toBe(400);
    const priv = await guest.post("/api/auth/register", { fullName: "Sneaky", email: "sneaky@example.com", password: "Secret123", role: "ADMIN" });
    expect(priv.status).toBe(400);
  });

  it("duplicate registration → 409", async () => {
    const r = await guest.post("/api/auth/register", { fullName: "Dup", email: "user@local.dev", password: "Secret123" });
    expect(r.status).toBe(409);
  });
});

describe("geospatial endpoints return correct, sorted distances", () => {
  it("nearby search results are inside the radius and ascending by distance", async () => {
    const r = await guest.get("/api/geo/nearby?lat=27.6915&lng=85.342&radiusKm=3");
    expect(r.status).toBe(200);
    expect(r.data.count).toBeGreaterThan(0);
    const d = r.data.results.map((x: { distanceKm: number }) => x.distanceKm);
    expect(d.every((v: number) => v <= 3)).toBe(true);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it("DBSCAN finds the seeded Kalanki hotspot", async () => {
    const officer = await as("WARD_OFFICER");
    const r = await officer.get("/api/geo/clusters");
    expect(r.status).toBe(200);
    const kalanki = r.data.clusters.find((c: { center: { lat: number; lng: number } }) => Math.abs(c.center.lat - 27.6935) < 0.01 && Math.abs(c.center.lng - 85.2817) < 0.01);
    expect(kalanki).toBeTruthy();
    expect(kalanki.count).toBeGreaterThanOrEqual(8);
  });

  it("public risk grid never exposes single-report cells", async () => {
    const r = await guest.get("/api/geo/risk-areas");
    expect(r.data.cells.every((c: { count: number }) => c.count >= 2)).toBe(true);
  });
});
