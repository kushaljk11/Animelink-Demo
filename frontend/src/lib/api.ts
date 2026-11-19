// Typed HTTP client. Next.js proxies /api to the configured backend.
// The session is an httpOnly cookie set through that proxy.

/** Same-origin base URL of the REST API. */
export const API_URL = "/api";

/** URL for an API path, usable in fetch, links, images, and downloads. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }

  /** First field-level message from a 400 VALIDATION_ERROR response, if any. */
  get fieldMessage(): string | null {
    const d = this.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined;
    const field = d?.fieldErrors && Object.entries(d.fieldErrors).find(([, v]) => v?.length);
    if (field) return `${field[0]}: ${field[1][0]}`;
    return d?.formErrors?.[0] ?? null;
  }
}

export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return null as T;
  const type = res.headers.get("content-type") ?? "";
  const body: unknown = type.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const err = (body as Partial<ApiErrorBody>)?.error;
    throw new ApiClientError(res.status, err?.message ?? `Request failed (${res.status})`, err?.code, err?.details);
  }
  return body as T;
}

export type ApiInit = Omit<RequestInit, "body"> & { body?: unknown };

/**
 * `api<T>("/pets", { method: "POST", body: {...} })`
 * JSON bodies are serialised automatically; FormData is sent as multipart.
 */
export async function api<T = unknown>(path: string, init?: ApiInit): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      credentials: "include",
      headers: { Accept: "application/json", ...(init?.body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
      body: init?.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiClientError(0, "Cannot reach the API. Check that the backend is running and its URL is configured.", "NETWORK_ERROR");
  }
  return parse<T>(res);
}

/** SWR fetcher: keys are API paths, e.g. useSWR<Paginated<Pet>>("/pets?limit=20"). */
export const fetcher = <T = unknown>(path: string) => api<T>(path);

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.fieldMessage ? `${err.message} — ${err.fieldMessage}` : err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

export type Paginated<T> = { data: T[]; meta: { page: number; limit: number; total: number; pageCount: number; unreadCount?: number } };

export async function uploadImage(file: File, kind: "pets" | "incidents" | "strays" | "breed") {
  const fd = new FormData();
  fd.append("kind", kind); // fields before the file so multer has them when the file arrives
  fd.append("file", file);
  return api<{ url: string; bytes: number; width: number; height: number }>("/uploads", { method: "POST", body: fd });
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
