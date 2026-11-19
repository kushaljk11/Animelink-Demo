// Business workflows & state transitions (Sections N, Y.1).
import { describe, expect, it } from "vitest";
import { as, Client, incidentPayload } from "./helpers";

describe("incident lifecycle (REPORTED → UNDER_REVIEW → VERIFIED → RESOLVED)", () => {
  it("walks the full valid path and exposes it on the public tracker", async () => {
    const guest = new Client();
    const created = await guest.post("/api/incidents", incidentPayload({ reporterPhone: "9841000001" }));
    expect(created.status).toBe(201);
    expect(created.data.status).toBe("REPORTED");
    const id = created.data.id as string;

    const officer = await as("WARD_OFFICER");
    for (const status of ["UNDER_REVIEW", "VERIFIED", "RESOLVED"]) {
      const r = await officer.patch(`/api/incidents/${id}/status`, { status, note: `moved to ${status}` });
      expect(r.status).toBe(200);
      expect(r.data.status).toBe(status);
    }

    const tracked = await guest.get(`/api/public/incidents/${id}`);
    expect(tracked.status).toBe(200);
    expect(tracked.data.timeline.map((t: { status: string }) => t.status)).toEqual(["REPORTED", "UNDER_REVIEW", "VERIFIED", "RESOLVED"]);
    expect(tracked.data).not.toHaveProperty("reporterPhone");
  });

  it("rejects transitions that skip the workflow with 409 Conflict and lists the allowed ones", async () => {
    const created = await new Client().post("/api/incidents", incidentPayload({ reporterPhone: "9841000002" }));
    const officer = await as("WARD_OFFICER");
    const skip = await officer.patch(`/api/incidents/${created.data.id}/status`, { status: "RESOLVED" });
    expect(skip.status).toBe(409);
    expect(skip.data.error.message).toMatch(/Allowed: UNDER_REVIEW, VERIFIED, DISMISSED/);
    const same = await officer.patch(`/api/incidents/${created.data.id}/status`, { status: "REPORTED" });
    expect(same.status).toBe(409);
  });

  it("rejects unknown status values with 400", async () => {
    const created = await new Client().post("/api/incidents", incidentPayload({ reporterPhone: "9841000003" }));
    const officer = await as("WARD_OFFICER");
    const r = await officer.patch(`/api/incidents/${created.data.id}/status`, { status: "IN_PROGRESS" });
    expect(r.status).toBe(400);
  });

  it("notifies a registered reporter when the status changes", async () => {
    const owner = await as("PET_OWNER");
    const created = await owner.post("/api/incidents", incidentPayload());
    const officer = await as("WARD_OFFICER");
    await officer.patch(`/api/incidents/${created.data.id}/status`, { status: "UNDER_REVIEW", note: "Field team dispatched" });
    const notes = await owner.get("/api/notifications?type=INCIDENT_UPDATE&limit=20");
    expect(notes.data.data.some((n: { message: string }) => n.message.includes("Field team dispatched"))).toBe(true);
  });

  it("reporters can edit only until review starts", async () => {
    const owner = await as("PET_OWNER");
    const created = await owner.post("/api/incidents", incidentPayload());
    expect((await owner.put(`/api/incidents/${created.data.id}`, { address: "Kalanki bus stop" })).status).toBe(200);
    await (await as("WARD_OFFICER")).patch(`/api/incidents/${created.data.id}/status`, { status: "UNDER_REVIEW" });
    expect((await owner.put(`/api/incidents/${created.data.id}`, { address: "changed" })).status).toBe(409);
  });

  it("guest reports require a contact phone", async () => {
    const r = await new Client().post("/api/incidents", incidentPayload());
    expect(r.status).toBe(400);
  });
});

describe("vaccination verification (PENDING → VERIFIED → REVOKED)", () => {
  it("owner submission stays pending until the named clinic verifies it", async () => {
    const owner = await as("PET_OWNER");
    const vet = await as("VET_CLINIC");
    const pets = await owner.get("/api/pets?limit=1");
    const me = await vet.get("/api/auth/me");
    const clinicId = me.data.user.veterinaryClinic.id as string;

    const sub = await owner.post("/api/vaccinations", {
      petId: pets.data.data[0].id,
      clinicId,
      vaccineName: "Nobivac Rabies",
      batchNumber: "RBTEST01",
      administeredDate: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      boosterDueDate: new Date(Date.now() + 345 * 86_400_000).toISOString(),
      verify: true, // ignored for owners
    });
    expect(sub.status).toBe(201);
    expect(sub.data.status).toBe("PENDING_VERIFICATION");

    expect((await owner.post(`/api/vaccinations/${sub.data.id}/verify`, { decision: "VERIFY" })).status).toBe(403);

    const verified = await vet.post(`/api/vaccinations/${sub.data.id}/verify`, { decision: "VERIFY" });
    expect(verified.status).toBe(200);
    expect(verified.data.status).toBe("VERIFIED");
    expect(verified.data.boosterStatus).toBe("UP_TO_DATE");

    expect((await vet.post(`/api/vaccinations/${sub.data.id}/verify`, { decision: "VERIFY" })).status).toBe(409);
    expect((await vet.del(`/api/vaccinations/${sub.data.id}`)).status).toBe(409);
    expect((await owner.put(`/api/vaccinations/${sub.data.id}`, { batchNumber: "HACKED" })).status).toBe(403);

    const revoked = await vet.post(`/api/vaccinations/${sub.data.id}/verify`, { decision: "REVOKE", notes: "Batch mismatch" });
    expect(revoked.data.status).toBe("REVOKED");
    expect((await vet.put(`/api/vaccinations/${sub.data.id}`, { notes: "x" })).status).toBe(409);
  });

  it("the PDF certificate is generated for the owner", async () => {
    const owner = await as("PET_OWNER");
    const pets = await owner.get("/api/pets?limit=1");
    const res = await fetch(`${(await import("./helpers")).BASE()}/api/pets/${pets.data.data[0].id}/certificate`, { headers: { cookie: owner.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("lost pet & QR scan flow", () => {
  it("lost mode reveals the owner's phone, scans notify the owner, found mode hides it again", async () => {
    const owner = await as("PET_OWNER");
    const pets = await owner.get("/api/pets?lost=false&limit=10");
    const pet = pets.data.data[0];
    const guest = new Client();

    expect((await guest.get(`/api/public/pets/${pet.qrToken}`)).data.owner.phone).toBeNull();

    expect((await owner.post(`/api/pets/${pet.id}/lost`, { lastSeenDate: new Date().toISOString(), description: "test" })).status).toBe(201);
    expect((await owner.post(`/api/pets/${pet.id}/lost`, { lastSeenDate: new Date().toISOString() })).status).toBe(409);
    const profile = await guest.get(`/api/public/pets/${pet.qrToken}`);
    expect(profile.data.lostStatus).toBe(true);
    expect(profile.data.owner.phone).toBeTruthy();
    expect(profile.data).not.toHaveProperty("medicalNotes");

    const scan = await guest.post(`/api/public/pets/${pet.qrToken}/scan`, { shareLocation: true, latitude: 27.69, longitude: 85.34, message: "Found at the integration test stop" });
    expect(scan.status).toBe(201);
    const notes = await owner.get("/api/notifications?type=LOST_PET_SCAN&limit=20");
    expect(notes.data.data.some((n: { message: string }) => n.message.includes("integration test stop"))).toBe(true);

    expect((await owner.post(`/api/pets/${pet.id}/found`, {})).status).toBe(200);
    expect((await guest.get(`/api/public/pets/${pet.qrToken}`)).data.owner.phone).toBeNull();
  });
});

describe("stray registration & duplicate detection", () => {
  it("blocks a likely duplicate with 409 until the user acknowledges it", async () => {
    const rescue = await as("RESCUE_ORG");
    const strays = await rescue.get("/api/strays?limit=50&sort=createdAt&order=asc");
    const s = strays.data.data.find((x: { tagOrEarMark: string | null }) => x.tagOrEarMark);
    const body = { tagOrEarMark: s.tagOrEarMark, latitude: s.latitude, longitude: s.longitude, color: s.color, gender: s.gender };

    const dup = await rescue.post("/api/strays", body);
    expect(dup.status).toBe(409);
    expect(dup.data.error.code).toBe("POSSIBLE_DUPLICATE");
    expect(dup.data.error.details.candidates[0].stray.id).toBe(s.id);

    const forced = await rescue.post("/api/strays", { ...body, acknowledgeDuplicates: true });
    expect(forced.status).toBe(201);
  });
});

describe("background reminders", () => {
  it("the booster reminder sweep is idempotent", async () => {
    const admin = await as("ADMIN");
    await admin.post("/api/notifications/reminders");
    const second = await admin.post("/api/notifications/reminders");
    expect(second.status).toBe(200);
    expect(second.data.dueSoonSent + second.data.overdueSent).toBe(0);
  });
});

describe("incident assignment (responsible ward officer)", () => {
  const officerId = async () => (await (await as("WARD_OFFICER")).get("/api/auth/me")).data.user.id as string;

  it("an officer's first status change claims an unassigned report", async () => {
    const created = await new Client().post("/api/incidents", incidentPayload({ reporterPhone: "9841000011" }));
    const officer = await as("WARD_OFFICER");
    await officer.patch(`/api/incidents/${created.data.id}/status`, { status: "UNDER_REVIEW" });
    const r = await officer.get(`/api/incidents/${created.data.id}`);
    expect(r.data.handledBy?.id).toBe(await officerId());
  });

  it("an admin changing status supervises without taking ownership", async () => {
    const created = await new Client().post("/api/incidents", incidentPayload({ reporterPhone: "9841000012" }));
    const admin = await as("ADMIN");
    const id = created.data.id as string;
    expect((await admin.patch(`/api/incidents/${id}/status`, { status: "UNDER_REVIEW", note: "checking" })).status).toBe(200);
    expect((await admin.get(`/api/incidents/${id}`)).data.handledById).toBeNull();

    const oid = await officerId();
    const assigned = await admin.patch(`/api/incidents/${id}/assign`, { handledById: oid, note: "please visit" });
    expect(assigned.status).toBe(200);
    expect(assigned.data.handledBy.id).toBe(oid);

    await admin.patch(`/api/incidents/${id}/status`, { status: "VERIFIED" });
    const after = await admin.get(`/api/incidents/${id}`);
    expect(after.data.handledBy.id).toBe(oid);
    expect(after.data.history.map((h: { action: string }) => h.action)).toContain("INCIDENT_ASSIGNED");

    const mine = await (await as("WARD_OFFICER")).get("/api/incidents?assigned=me&limit=100");
    expect(mine.data.data.some((i: { id: string }) => i.id === id)).toBe(true);
    const notes = await (await as("WARD_OFFICER")).get("/api/notifications?limit=20");
    expect(notes.data.data.some((n: { link: string; title: string }) => n.link === `/app/incidents/${id}` && /assigned to you/i.test(n.title))).toBe(true);
  });

  it("lists only officers covering the incident's municipality", async () => {
    const created = await new Client().post("/api/incidents", incidentPayload({ reporterPhone: "9841000013" }));
    const r = await (await as("ADMIN")).get(`/api/incidents/${created.data.id}/assignees`);
    expect(r.status).toBe(200);
    expect(r.data.officers.length).toBeGreaterThan(0);
    expect(r.data.organizations.length).toBeGreaterThan(0);
    const d = r.data.organizations.map((o: { distanceKm: number }) => o.distanceKm);
    expect([...d].sort((x, y) => x - y)).toEqual(d);
    for (const o of r.data.officers) expect([null, "Kathmandu Metropolitan City"]).toContain(o.municipality);
  });

  it("rejects non-officers and officers from another municipality; unassign works", async () => {
    const created = await new Client().post("/api/incidents", incidentPayload({ reporterPhone: "9841000014" }));
    const admin = await as("ADMIN");
    const id = created.data.id as string;
    const users = await admin.get("/api/users?role=WARD_OFFICER,PET_OWNER&limit=100");
    const owner = users.data.data.find((u: { role: string }) => u.role === "PET_OWNER");
    const outsider = users.data.data.find((u: { role: string; municipality: string | null }) => u.role === "WARD_OFFICER" && u.municipality && u.municipality !== "Kathmandu Metropolitan City");
    expect((await admin.patch(`/api/incidents/${id}/assign`, { handledById: owner.id })).status).toBe(400);
    if (outsider) expect((await admin.patch(`/api/incidents/${id}/assign`, { handledById: outsider.id })).status).toBe(400);

    const oid = await officerId();
    expect((await admin.patch(`/api/incidents/${id}/assign`, { handledById: oid })).status).toBe(200);
    expect((await admin.patch(`/api/incidents/${id}/assign`, { handledById: oid })).status).toBe(409);
    const un = await admin.patch(`/api/incidents/${id}/assign`, { handledById: null });
    expect(un.status).toBe(200);
    expect(un.data.handledById).toBeNull();
    expect((await (await as("PET_OWNER")).patch(`/api/incidents/${id}/assign`, { handledById: oid })).status).toBe(403);
  });
});

describe("taking a case (rescue organisations & officers)", () => {
  const meId = async (role: "RESCUE_ORG" | "WARD_OFFICER") => (await (await as(role)).get("/api/auth/me")).data.user.id as string;

  it("a verified rescue org takes an unassigned report, sees the reporter, updates status and admin sees who owns it", async () => {
    const created = await new Client().post("/api/incidents", incidentPayload({ reporterPhone: "9841000021", severity: "LOW" }));
    const id = created.data.id as string;
    const rescue = await as("RESCUE_ORG");

    const before = await rescue.get(`/api/incidents/${id}`);
    expect(before.data.reporterPhone).toBeNull(); // redacted until they own it
    expect((await rescue.patch(`/api/incidents/${id}/status`, { status: "UNDER_REVIEW" })).status).toBe(403);

    const took = await rescue.post(`/api/incidents/${id}/claim`, {});
    expect(took.status).toBe(200);
    expect(took.data.handledBy.role).toBe("RESCUE_ORG");
    expect(took.data.handledBy.rescueOrganization.organizationName).toBeTruthy();
    expect(took.data.reporterPhone).toBe("9841000021");

    expect((await rescue.patch(`/api/incidents/${id}/status`, { status: "UNDER_REVIEW", note: "team on the way" })).status).toBe(200);

    const admin = await as("ADMIN");
    const seen = await admin.get(`/api/incidents/${id}`);
    expect(seen.data.handledBy.id).toBe(await meId("RESCUE_ORG"));
    expect(seen.data.history.map((h: { action: string }) => h.action)).toEqual(expect.arrayContaining(["INCIDENT_CLAIMED", "INCIDENT_STATUS_CHANGED"]));
    const notes = await admin.get("/api/notifications?limit=30");
    expect(notes.data.data.some((n: { link: string; title: string }) => n.link === `/app/incidents/${id}` && /took a case/.test(n.title))).toBe(true);
  });

  it("first come, first served: a second taker gets 409 naming the owner; admin can still reassign", async () => {
    const created = await new Client().post("/api/incidents", incidentPayload({ reporterPhone: "9841000022", severity: "LOW" }));
    const id = created.data.id as string;
    expect((await (await as("RESCUE_ORG")).post(`/api/incidents/${id}/claim`, {})).status).toBe(200);
    const second = await (await as("WARD_OFFICER")).post(`/api/incidents/${id}/claim`, {});
    expect(second.status).toBe(409);
    expect(second.data.error.message).toMatch(/Already taken by/);

    const oid = await meId("WARD_OFFICER");
    const re = await (await as("ADMIN")).patch(`/api/incidents/${id}/assign`, { handledById: oid });
    expect(re.status).toBe(200);
    // the rescue org no longer owns it, so it can't change status any more
    expect((await (await as("RESCUE_ORG")).patch(`/api/incidents/${id}/status`, { status: "UNDER_REVIEW" })).status).toBe(403);
  });

  it("the handler can release a case back to the queue; others cannot", async () => {
    const created = await new Client().post("/api/incidents", incidentPayload({ reporterPhone: "9841000023", severity: "LOW" }));
    const id = created.data.id as string;
    const rescue = await as("RESCUE_ORG");
    await rescue.post(`/api/incidents/${id}/claim`, {});
    expect((await (await as("WARD_OFFICER")).post(`/api/incidents/${id}/release`, {})).status).toBe(403);
    const rel = await rescue.post(`/api/incidents/${id}/release`, { note: "too far for our van" });
    expect(rel.status).toBe(200);
    expect(rel.data.handledById).toBeNull();
    expect((await (await as("PET_OWNER")).post(`/api/incidents/${id}/claim`, {})).status).toBe(403);
  });

  it("closed reports cannot be taken", async () => {
    const created = await new Client().post("/api/incidents", incidentPayload({ reporterPhone: "9841000024", severity: "LOW" }));
    const id = created.data.id as string;
    const admin = await as("ADMIN");
    await admin.patch(`/api/incidents/${id}/status`, { status: "DISMISSED", note: "duplicate" });
    expect((await (await as("RESCUE_ORG")).post(`/api/incidents/${id}/claim`, {})).status).toBe(409);
  });
});
