// HTTP helpers shared by controllers: typed errors, validation, the table list contract, rate limiting.
import type { Request } from "express";
import { z, type ZodTypeAny } from "zod";

// ------------------------------------------------------------------ errors ---

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ERROR",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, message, "BAD_REQUEST", details);
export const unauthorized = (message = "Authentication required") => new ApiError(401, message, "UNAUTHENTICATED");
export const forbidden = (message = "You do not have permission to perform this action") => new ApiError(403, message, "FORBIDDEN");
export const notFound = (entity = "Resource") => new ApiError(404, `${entity} not found`, "NOT_FOUND");
export const conflict = (message: string) => new ApiError(409, message, "CONFLICT");

// -------------------------------------------------------------- validation ---

/** Raw query string as URLSearchParams (keeps repeated/CSV params exactly as sent). */
export function searchParams(req: Request): URLSearchParams {
  const i = req.originalUrl.indexOf("?");
  return new URLSearchParams(i >= 0 ? req.originalUrl.slice(i + 1) : "");
}

/** Validates the JSON body; throws ZodError → 400 VALIDATION_ERROR via the error middleware. */
export function parseBody<S extends ZodTypeAny>(req: Request, schema: S): z.output<S> {
  return schema.parse(req.body ?? {});
}

export function parseQuery<S extends ZodTypeAny>(req: Request, schema: S): z.output<S> {
  return schema.parse(Object.fromEntries(searchParams(req)));
}

// ------------------------------------------------------- list / tables ---

const listBase = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  query: z.string().trim().max(100).optional(),
  sort: z.string().max(40).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  status: z.string().max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ListParams = {
  page: number;
  limit: number;
  skip: number;
  take: number;
  query?: string;
  orderBy: Record<string, "asc" | "desc">;
  status?: string[];
  from?: Date;
  to?: Date;
  sp: URLSearchParams;
};

/** The TanStack table contract: page, limit, query, sort (whitelisted), order, status (csv), from, to. */
export function parseList(req: Request, sortable: readonly string[], defaultSort: string): ListParams {
  const sp = searchParams(req);
  const raw: Record<string, string> = {};
  sp.forEach((v, k) => {
    if (k in listBase.shape) raw[k] = v;
  });
  const q = listBase.parse(raw);
  if (q.sort && !sortable.includes(q.sort)) throw badRequest(`Cannot sort by "${q.sort}". Allowed: ${sortable.join(", ")}`);
  const sort = q.sort ?? defaultSort;
  return {
    page: q.page,
    limit: q.limit,
    skip: (q.page - 1) * q.limit,
    take: q.limit,
    query: q.query || undefined,
    orderBy: { [sort]: q.order },
    status: q.status ? q.status.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    from: q.from,
    to: q.to,
    sp,
  };
}

export function paginated<T>(data: T[], total: number, p: Pick<ListParams, "page" | "limit">) {
  return { data, meta: { page: p.page, limit: p.limit, total, pageCount: Math.max(1, Math.ceil(total / p.limit)) } };
}

export function enumFilter<E extends Record<string, string>>(values: string[] | undefined, e: E, label = "status") {
  if (!values?.length) return undefined;
  const allowed = Object.values(e);
  const bad = values.filter((v) => !allowed.includes(v));
  if (bad.length) throw badRequest(`Unknown ${label}: ${bad.join(", ")}. Allowed: ${allowed.join(", ")}`);
  return values as E[keyof E][];
}

export const csvParam = (sp: URLSearchParams, key: string) => sp.get(key)?.split(",").filter(Boolean);

export function boolParam(sp: URLSearchParams, key: string): boolean | undefined {
  const v = sp.get(key);
  if (v === null || v === "") return undefined;
  if (["1", "true", "yes"].includes(v.toLowerCase())) return true;
  if (["0", "false", "no"].includes(v.toLowerCase())) return false;
  throw badRequest(`Query parameter "${key}" must be true or false`);
}

export function intParam(sp: URLSearchParams, key: string): number | undefined {
  const v = sp.get(key);
  if (v === null || v === "") return undefined;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw badRequest(`Query parameter "${key}" must be an integer`);
  return n;
}

export function dateRange(field: string, from?: Date, to?: Date) {
  return from || to ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
}

// ---------------------------------------------------------- rate limit ---

const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Fixed-window in-memory limiter for public/unauthenticated endpoints.
 * RATE_LIMIT_MULTIPLIER scales every limit (the integration suite raises it).
 */
export function rateLimit(key: string, baseLimit: number, windowMs: number) {
  const multiplier = Number(process.env.RATE_LIMIT_MULTIPLIER);
  const limit = Number.isFinite(multiplier) && multiplier > 0 ? Math.ceil(baseLimit * multiplier) : baseLimit;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return;
  }
  b.count += 1;
  if (b.count > limit) {
    const retry = Math.ceil((b.resetAt - now) / 1000);
    throw new ApiError(429, `Too many requests. Retry in ${retry}s`, "RATE_LIMITED", { retryAfterSeconds: retry });
  }
}

export function clientIp(req: Pick<Request, "headers" | "ip">): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  return first?.split(",")[0]?.trim() || req.ip || "local";
}

/** Public web app origin — QR codes and certificates link to pages on the frontend. */
export function frontendOrigin(): string {
  return (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** A single named route parameter as a string (Express 5 types allow string[] for wildcards). */
export function param(req: Request, name: string): string {
  const v = (req.params as Record<string, string | string[] | undefined>)[name];
  if (Array.isArray(v)) return v.join("/");
  if (!v) throw badRequest(`Missing route parameter "${name}"`);
  return v;
}
