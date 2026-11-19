import { inject } from "vitest";

export const BASE = () => inject("baseUrl");

export type Res<T = any> = { status: number; data: T; headers: Headers };

/** Minimal cookie-jar HTTP client: one instance = one browser session. */
export class Client {
  cookie = "";

  async req<T = any>(method: string, path: string, body?: unknown, raw?: string): Promise<Res<T>> {
    const res = await fetch(BASE() + path, {
      method,
      redirect: "manual",
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body !== undefined || raw !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const set = res.headers.get("set-cookie");
    const m = set?.match(/rtn_session=([^;]*)/);
    if (m) this.cookie = m[1] ? `rtn_session=${m[1]}` : "";
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data: data as T, headers: res.headers };
  }

  get<T = any>(p: string) {
    return this.req<T>("GET", p);
  }
  post<T = any>(p: string, b: unknown = {}) {
    return this.req<T>("POST", p, b);
  }
  put<T = any>(p: string, b: unknown) {
    return this.req<T>("PUT", p, b);
  }
  patch<T = any>(p: string, b: unknown) {
    return this.req<T>("PATCH", p, b);
  }
  del<T = any>(p: string) {
    return this.req<T>("DELETE", p);
  }
}

export const DEMO = {
  ADMIN: ["admin@local.dev", "Admin@1234"],
  WARD_OFFICER: ["operator@local.dev", "Operator@1234"],
  PET_OWNER: ["user@local.dev", "User@1234"],
  VET_CLINIC: ["vet@local.dev", "Vet@1234"],
  RESCUE_ORG: ["rescue@local.dev", "Rescue@1234"],
} as const;

export async function as(role: keyof typeof DEMO): Promise<Client> {
  const c = new Client();
  const [email, password] = DEMO[role];
  const r = await c.post("/api/auth/login", { email, password });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.data)}`);
  return c;
}

export async function loginAs(email: string, password: string) {
  const c = new Client();
  const r = await c.post("/api/auth/login", { email, password });
  return { client: c, res: r };
}

export const KMC = "Kathmandu Metropolitan City";

export function incidentPayload(overrides: Record<string, unknown> = {}) {
  return {
    animalType: "DOG",
    severity: "HIGH",
    description: "Integration test: dog bit a pedestrian near Kalanki Chowk.",
    incidentDate: new Date(Date.now() - 3_600_000).toISOString(),
    suspectedRabies: false,
    latitude: 27.6936,
    longitude: 85.2818,
    address: "Kalanki Chowk",
    municipality: KMC,
    wardNumber: 14,
    ...overrides,
  };
}
