// Authentication & role-based access control (Sections K, U, Y.1/Y.5).
import { beforeAll, describe, expect, it } from "vitest";
import { as, Client, incidentPayload, KMC, loginAs } from "./helpers";

describe("authentication guard — anonymous requests get 401", () => {
  const guest = new Client();
  it.each([
    ["GET", "/api/auth/me"],
    ["GET", "/api/pets"],
    ["POST", "/api/pets"],
    ["GET", "/api/vaccinations"],
    ["POST", "/api/vaccinations"],
    ["GET", "/api/incidents"],
    ["PATCH", "/api/incidents/abc/status"],
    ["GET", "/api/strays"],
    ["GET", "/api/cnvr"],
    ["GET", "/api/notifications"],
    ["GET", "/api/users"],
    ["GET", "/api/audit"],
    ["GET", "/api/stats/overview"],
    ["GET", "/api/search?q=kalanki"],
    ["GET", "/api/geo/clusters"],
    ["GET", "/api/reports/export?entity=incidents"],
    ["POST", "/api/notifications/reminders"],
    ["POST", "/api/ai/breed"],
  ])("%s %s → 401", async (method, path) => {
    const r = await guest.req(method, path, method === "GET" ? undefined : {});
    expect(r.status).toBe(401);
    expect(r.data.error.code).toBe("UNAUTHENTICATED");
  });

  it("public endpoints stay open without a session", async () => {
    expect((await guest.get("/api/health")).status).toBe(200);
    expect((await guest.get("/api/clinics")).status).toBe(200);
    expect((await guest.get("/api/geo/nearby?lat=27.69&lng=85.34&radiusKm=3")).status).toBe(200);
    expect((await guest.get("/api/lost-reports")).status).toBe(200);
  });
});

describe("login & sessions", () => {
  it("rejects a wrong password and an unknown email with the same 401", async () => {
    const wrong = await loginAs("user@local.dev", "Wrong@1234");
    const unknown = await loginAs("nobody@local.dev", "Wrong@1234");
    expect(wrong.res.status).toBe(401);
    expect(unknown.res.status).toBe(401);
    expect(wrong.res.data.error.message).toBe(unknown.res.data.error.message);
  });

  it("never returns the password hash", async () => {
    const { res } = await loginAs("user@local.dev", "User@1234");
    expect(res.status).toBe(200);
    expect(res.data.user).not.toHaveProperty("passwordHash");
  });

  it("locks an account (423) after 5 failed attempts", async () => {
    const admin = await as("ADMIN");
    const owners = await admin.get("/api/users?role=PET_OWNER&limit=50");
    const victim = owners.data.data.find((u: { email: string }) => u.email.endsWith("@example.com"));
    for (let i = 0; i < 5; i++) expect((await loginAs(victim.email, "Wrong@1234")).res.status).toBe(401);
    const locked = await loginAs(victim.email, "Password@123");
    expect(locked.res.status).toBe(423);
    expect(locked.res.data.error.code).toBe("ACCOUNT_LOCKED");
  });

  it("rejects a tampered session token", async () => {
    const c = await as("PET_OWNER");
    const [name, value] = c.cookie.split("=");
    const parts = value!.split(".");
    parts[1] = Buffer.from(JSON.stringify({ sub: "x", sid: "y", role: "ADMIN" })).toString("base64url");
    c.cookie = `${name}=${parts.join(".")}`;
    expect((await c.get("/api/auth/me")).status).toBe(401);
  });

  it("logout revokes the session server-side (a copied cookie stops working)", async () => {
    const c = await as("PET_OWNER");
    const stolen = c.cookie;
    expect((await c.post("/api/auth/logout")).status).toBe(204);
    const replay = new Client();
    replay.cookie = stolen;
    expect((await replay.get("/api/auth/me")).status).toBe(401);
  });

});

describe("role gates — lower-privilege roles get 403", () => {
  let ids: { clinicId: string; incidentId: string; strayId: string; petId: string };

  beforeAll(async () => {
    const admin = await as("ADMIN");
    const [clinics, incidents, strays, pets] = await Promise.all([
      admin.get("/api/clinics?limit=1"),
      admin.get("/api/incidents?limit=1&status=REPORTED"),
      admin.get("/api/strays?limit=1"),
      admin.get("/api/pets?limit=1"),
    ]);
    ids = { clinicId: clinics.data.data[0].id, incidentId: incidents.data.data[0].id, strayId: strays.data.data[0].id, petId: pets.data.data[0].id };
  });

  const cases: [string, "PET_OWNER" | "WARD_OFFICER" | "VET_CLINIC" | "RESCUE_ORG", string, (i: typeof ids) => string, unknown?][] = [
    ["owner lists users", "PET_OWNER", "GET", () => "/api/users"],
    ["owner verifies a clinic", "PET_OWNER", "POST", (i) => `/api/clinics/${i.clinicId}/verification`, { status: "VERIFIED" }],
    ["owner changes incident status", "PET_OWNER", "PATCH", (i) => `/api/incidents/${i.incidentId}/status`, { status: "UNDER_REVIEW" }],
    ["owner runs cluster analysis", "PET_OWNER", "GET", () => "/api/geo/clusters"],
    ["owner views strays", "PET_OWNER", "GET", () => "/api/strays"],
    ["owner exports incidents", "PET_OWNER", "GET", () => "/api/reports/export?entity=incidents"],
    ["ward officer lists pets", "WARD_OFFICER", "GET", () => "/api/pets"],
    ["ward officer records a vaccination", "WARD_OFFICER", "POST", (i) => "/api/vaccinations", undefined],
    ["ward officer verifies a clinic (admin only)", "WARD_OFFICER", "POST", (i) => `/api/clinics/${i.clinicId}/verification`, { status: "VERIFIED" }],
    ["vet records CNVR", "VET_CLINIC", "POST", (i) => "/api/cnvr", undefined],
    ["vet runs the reminder sweep (admin only)", "VET_CLINIC", "POST", () => "/api/notifications/reminders"],
    ["vet edits a stray", "VET_CLINIC", "PUT", (i) => `/api/strays/${i.strayId}`, { color: "black" }],
    ["rescue org registers a pet", "RESCUE_ORG", "POST", () => "/api/pets", { name: "X", species: "DOG" }],
    ["rescue org creates a user", "RESCUE_ORG", "POST", () => "/api/users", {}],
    ["rescue org views audit log", "RESCUE_ORG", "GET", () => "/api/audit"],
  ];

  it.each(cases)("%s → 403", async (_label, role, method, path, body) => {
    const c = await as(role);
    const payload =
      body ??
      (path(ids) === "/api/vaccinations"
        ? { petId: ids.petId, vaccineName: "Rabisin", batchNumber: "RB1", administeredDate: new Date().toISOString() }
        : path(ids) === "/api/cnvr"
          ? { strayId: ids.strayId, vaccineName: "Rabisin", vaccinationDate: new Date().toISOString() }
          : undefined);
    const r = await c.req(method, path(ids), method === "GET" ? undefined : (payload ?? {}));
    expect(r.status).toBe(403);
  });

  it("an unverified clinic cannot record vaccinations", async () => {
    const admin = await as("ADMIN");
    const pending = await admin.get("/api/clinics?status=PENDING&limit=1");
    const owner = pending.data.data[0].user.email as string;
    const { client } = await loginAs(owner, "Password@123");
    const r = await client.post("/api/vaccinations", { petId: ids.petId, vaccineName: "Rabisin", batchNumber: "RB9", administeredDate: new Date().toISOString(), verify: true });
    expect(r.status).toBe(403);
    expect(r.data.error.code).toBe("CLINIC_NOT_VERIFIED");
  });
});

describe("data scoping (row-level access)", () => {
  it("pet owners only ever see their own pets", async () => {
    const c = await as("PET_OWNER");
    const me = await c.get("/api/auth/me");
    const pets = await c.get("/api/pets?limit=100");
    expect(pets.data.data.length).toBeGreaterThan(0);
    expect(pets.data.data.every((p: { owner: { id: string } }) => p.owner.id === me.data.user.id)).toBe(true);
  });

  it("another owner's pet is invisible (404, not 403 — no existence leak)", async () => {
    const admin = await as("ADMIN");
    const owner = await as("PET_OWNER");
    const me = await owner.get("/api/auth/me");
    const all = await admin.get("/api/pets?limit=100");
    const foreign = all.data.data.find((p: { owner: { id: string } }) => p.owner.id !== me.data.user.id);
    expect((await owner.get(`/api/pets/${foreign.id}`)).status).toBe(404);
  });

  it("ward officers see only their municipality", async () => {
    const c = await as("WARD_OFFICER");
    const r = await c.get("/api/incidents?limit=100");
    expect(r.data.data.length).toBeGreaterThan(0);
    expect(r.data.data.every((i: { municipality: string }) => i.municipality === KMC)).toBe(true);
  });

  it("rescue organisations see incidents with reporter details redacted", async () => {
    const guest = new Client();
    const created = await guest.post("/api/incidents", incidentPayload({ reporterName: "Redact Me", reporterPhone: "9841000099" }));
    const rescue = await as("RESCUE_ORG");
    const r = await rescue.get(`/api/incidents/${created.data.id}`);
    expect(r.status).toBe(200);
    expect(r.data.reporterPhone).toBeNull();
    expect(r.data.reporterName).toBeNull();
  });

  it("the public clinic directory lists only verified clinics", async () => {
    const r = await new Client().get("/api/clinics?limit=100");
    expect(r.data.data.every((c: { verificationStatus: string }) => c.verificationStatus === "VERIFIED")).toBe(true);
  });

  it("admins pass every role gate", async () => {
    const admin = await as("ADMIN");
    expect((await admin.get("/api/users")).status).toBe(200);
    expect((await admin.get("/api/geo/clusters")).status).toBe(200);
    expect((await admin.get("/api/strays")).status).toBe(200);
  });
});
