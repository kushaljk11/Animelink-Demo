// Nepal localisation: tracking codes, phone/code tracker, SMS dispatch, contact OTP, BS dates in responses.
import { describe, expect, it } from "vitest";
import { as, Client, incidentPayload } from "./helpers";

const CODE = /^NP-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const outbox = async () => (await new Client().get("/api/__test/outbox")).data.data as { to: string; text: string; tag: string }[];

describe("tracking codes & public tracker", () => {
  it("issues an NP-XXXX-XXXX code, normalises +977 phones and SMSes the code to a guest", async () => {
    const r = await new Client().post("/api/incidents", incidentPayload({ reporterPhone: "+977 984-1000101" }));
    expect(r.status).toBe(201);
    expect(r.data.trackingCode).toMatch(CODE);
    const sent = (await outbox()).find((m) => m.tag === "incident.created" && m.text.includes(r.data.trackingCode));
    expect(sent?.to).toBe("9841000101");
    expect(sent?.text).toMatch(/hospital today/);
  });

  it("rejects landlines and short numbers for public submissions", async () => {
    for (const phone of ["01-4412345", "98410001", "9641000102"]) {
      const r = await new Client().post("/api/incidents", incidentPayload({ reporterPhone: phone }));
      expect(r.status).toBe(400);
    }
  });

  it("tracks by code (any formatting) with notes, and by mobile number without notes", async () => {
    const guest = new Client();
    const r = await guest.post("/api/incidents", incidentPayload({ reporterPhone: "9741000103" }));
    const code = r.data.trackingCode as string;
    await (await as("WARD_OFFICER")).patch(`/api/incidents/${r.data.id}/status`, { status: "UNDER_REVIEW", note: "Team visiting Kalanki today" });

    for (const q of [code, code.toLowerCase(), code.replace(/-/g, ""), code.slice(3)]) {
      const t = await guest.get(`/api/public/track?query=${encodeURIComponent(q)}`);
      expect(t.status).toBe(200);
      expect(t.data.matchedBy).toBe("code");
      expect(t.data.results[0].code).toBe(code);
      expect(t.data.results[0].status).toBe("UNDER_REVIEW");
      expect(t.data.results[0].incidentDateBS).toMatch(/^\d{4}-\d\d-\d\d$/);
      expect(t.data.results[0].timeline.at(-1).note).toBe("Team visiting Kalanki today");
    }

    const byPhone = await guest.get("/api/public/track?query=974-100-0103");
    expect(byPhone.status).toBe(200);
    expect(byPhone.data.matchedBy).toBe("phone");
    const hit = byPhone.data.results.find((x: { code: string }) => x.code === code);
    expect(hit.latestNote).toBeNull();
    expect(hit.timeline.every((t: { note: string | null; status: string }) => t.status === "REPORTED" || t.note === null)).toBe(true);
    for (const k of ["reporterPhone", "reporterName", "description", "latitude", "id"]) expect(hit).not.toHaveProperty(k);

    const sms = (await outbox()).find((m) => m.tag === "incident.status" && m.text.includes(code));
    expect(sms?.text).toMatch(/under review/i);
  });

  it("returns 400 for junk queries and 404 for unknown codes/numbers; the legacy route accepts codes", async () => {
    const g = new Client();
    expect((await g.get("/api/public/track?query=hello-world")).status).toBe(400);
    expect((await g.get("/api/public/track?query=NP-ZZZZ-ZZZZ")).status).toBe(404);
    expect((await g.get("/api/public/track?query=9800000000")).status).toBe(404);
    const r = await g.post("/api/incidents", incidentPayload({ reporterPhone: "9841000104" }));
    const legacy = await g.get(`/api/public/incidents/${r.data.trackingCode}`);
    expect(legacy.status).toBe(200);
    expect(legacy.data.code).toBe(r.data.trackingCode);
  });
});

describe("dual calendar in API responses", () => {
  it("adds <key>BS next to every date", async () => {
    const r = await new Client().post("/api/incidents", incidentPayload({ reporterPhone: "9841000105" }));
    const got = await (await as("ADMIN")).get(`/api/incidents/${r.data.id}`);
    expect(got.data.createdAtBS).toMatch(/^20[89]\d-\d\d-\d\d$/);
    expect(got.data.incidentDateBS).toMatch(/^20[89]\d-\d\d-\d\d$/);
    const list = await (await as("ADMIN")).get("/api/incidents?limit=2");
    expect(list.data.data[0].createdAtBS).toMatch(/^\d{4}-\d\d-\d\d$/);
  });
});

describe("contact inquiries with SMS verification", () => {
  it("verifies the phone by one-time code, stores the inquiry and alerts admins", async () => {
    const g = new Client();
    const sent = await g.post("/api/public/otp", { phone: "9851000106" });
    expect(sent.status).toBe(200);
    expect(sent.data.to).toBe("985****106");
    const code = (await outbox()).filter((m) => m.tag === "contact.otp" && m.to === "9851000106").at(-1)!.text.match(/\b(\d{6})\b/)![1]!;

    const body = { name: "Sita Tamang", phone: "9851000106", topic: "GENERAL", message: "How do I register my cat's vaccination?" };
    const wrong = await g.post("/api/public/inquiries", { ...body, otp: code === "000000" ? "111111" : "000000" });
    expect(wrong.status).toBe(400);
    const ok = await g.post("/api/public/inquiries", { ...body, otp: code });
    expect(ok.status).toBe(201);
    expect(ok.data.reference).toHaveLength(6);
    expect((await g.post("/api/public/inquiries", { ...body, otp: code })).status).toBe(400); // single use

    const admin = await as("ADMIN");
    const list = await admin.get("/api/inquiries?limit=5");
    expect(list.data.data[0]).toMatchObject({ name: "Sita Tamang", phoneVerified: true });
    expect((await (await as("PET_OWNER")).get("/api/inquiries")).status).toBe(403);
  });
});

describe("public milestones map", () => {
  it("returns coarse resolved cases without identifiers", async () => {
    const r = await new Client().get("/api/public/milestones");
    expect(r.status).toBe(200);
    for (const m of r.data.data) {
      expect(Math.round(m.lat * 100) / 100).toBe(m.lat);
      expect(m).not.toHaveProperty("id");
      expect(m).not.toHaveProperty("trackingCode");
    }
  });
});
