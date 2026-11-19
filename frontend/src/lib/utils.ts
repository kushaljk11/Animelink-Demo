import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export function formatDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  // Always Kathmandu time: identical on server and client (no hydration drift) and matches the BS calendar day.
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kathmandu", ...opts }).format(date);
}

export function formatDateTime(d: string | Date | null | undefined) {
  return formatDate(d, { dateStyle: "medium", timeStyle: "short" });
}

export function timeAgo(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  const abs = Math.abs(s);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(-s, "second");
  if (abs < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(-Math.round(s / 86400), "day");
  return formatDate(date);
}

export const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function initials(name: string) {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
