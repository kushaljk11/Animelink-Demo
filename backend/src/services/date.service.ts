// Dual calendar: storage stays UTC; Bikram Sambat (BS) is derived for display and API consumers.
// Conversion uses the calendar date in Nepal (UTC+05:45), so 23:00 UTC is already "tomorrow" in Kathmandu.
import NepaliDateModule from "nepali-date-converter";

type NepaliDateCtor = new (d: Date) => { format(f: string, lang?: "en" | "np"): string; getYear(): number; getMonth(): number; getDate(): number };
const NepaliDate = ((NepaliDateModule as unknown as { default?: NepaliDateCtor }).default ?? NepaliDateModule) as unknown as NepaliDateCtor;

const NPT_OFFSET_MS = (5 * 60 + 45) * 60_000;

/** The wall-clock calendar date in Kathmandu, as a local-midnight-safe Date the converter can read. */
function nepalCalendarDate(d: Date): Date {
  const shifted = new Date(d.getTime() + NPT_OFFSET_MS);
  return new Date(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 12);
}

/** Supported range of the bundled BS tables (≈ 1943–2033 AD comfortably). */
function convertible(d: Date) {
  const y = d.getUTCFullYear();
  return Number.isFinite(d.getTime()) && y >= 1944 && y <= 2033;
}

/** "2083-07-23" or null when out of range / invalid. */
export function toBS(input: Date | string | null | undefined): string | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (!convertible(d)) return null;
  try {
    return new NepaliDate(nepalCalendarDate(d)).format("YYYY-MM-DD");
  } catch {
    return null;
  }
}

/** "२०८३ कार्तिक २३" (lang "np") or "2083 Kartik 23" (lang "en"). */
export function formatBS(input: Date | string | null | undefined, lang: "en" | "np" = "np"): string | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (!convertible(d)) return null;
  try {
    return new NepaliDate(nepalCalendarDate(d)).format("YYYY MMMM DD", lang);
  } catch {
    return null;
  }
}

/** { dateAD: "2026-11-09", dateBS: "2083-07-23" } in Nepal time. */
export function dualDate(input: Date | string) {
  const d = input instanceof Date ? input : new Date(input);
  return { dateAD: isoDateNPT(d), dateBS: toBS(d) };
}

function isoDateNPT(d: Date) {
  return new Date(d.getTime() + NPT_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Adds a sibling `<key>BS` string next to every Date in an API payload
 * (createdAt → createdAtBS: "2083-07-23"). Applied once in app.ts to all JSON responses.
 */
export function withBSDates<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => withBSDates(v, depth + 1)) as T;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value; // Dates, Decimals, Buffers… stay as they are
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = v instanceof Date ? v : withBSDates(v, depth + 1);
    if (v instanceof Date && !(`${k}BS` in (value as object))) out[`${k}BS`] = toBS(v);
  }
  return out as T;
}
