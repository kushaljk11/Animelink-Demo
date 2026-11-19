// Bikram Sambat (BS) helpers for display. Storage/API stay UTC; BS is derived for the calendar day in Kathmandu.
import NepaliDateModule from "nepali-date-converter";
import { formatDate } from "./utils";

type NepaliDateCtor = new (d: Date) => { format(f: string, lang?: "en" | "np"): string };
const NepaliDate = ((NepaliDateModule as unknown as { default?: NepaliDateCtor }).default ?? NepaliDateModule) as unknown as NepaliDateCtor;
const NPT_OFFSET_MS = (5 * 60 + 45) * 60_000;

function parse(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  return y >= 1944 && y <= 2033 ? date : null; // range covered by the converter's tables
}

function nepalDay(d: Date) {
  const s = new Date(d.getTime() + NPT_OFFSET_MS);
  return new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 12);
}

/** "२०८३ कार्तिक २३" (Devanagari) or "2083 Kartik 23". */
export function formatBS(d: string | Date | null | undefined, script: "np" | "en" = "np"): string | null {
  const date = parse(d);
  if (!date) return null;
  try {
    return new NepaliDate(nepalDay(date)).format("YYYY MMMM DD", script);
  } catch {
    return null;
  }
}

/** "2083-07-23" */
export function toBS(d: string | Date | null | undefined): string | null {
  const date = parse(d);
  if (!date) return null;
  try {
    return new NepaliDate(nepalDay(date)).format("YYYY-MM-DD");
  } catch {
    return null;
  }
}

/** "Nov 9, 2026 | २०८३ कार्तिक २३" */
export function formatDual(d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  const ad = formatDate(d, opts);
  const bs = formatBS(d);
  return bs ? `${ad} | ${bs}` : ad;
}
