// Place lookup for Nepal: reverse geocoding (pin → municipality/ward/landmark) and municipality search.
// Online: OpenStreetMap Nominatim (free, no key; usage policy = ≤1 req/s, identifying User-Agent, cache results).
// Offline / GEOCODER=off: falls back to municipalities already present in our own records, so the app stays local-first.
import { prisma } from "../config/db";
import { boundingBox, bboxWhere, haversineKm, type LatLng } from "./geo";

const BASE = (process.env.GEOCODER_URL ?? "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const enabled = () => process.env.GEOCODER !== "off" && process.env.NODE_ENV !== "test";
const USER_AGENT = "RabiesTrackNepal/1.0 (academic One Health project)";

export type Place = {
  municipality: string | null;
  wardNumber: number | null;
  address: string | null;
  label: string;
  inNepal: boolean;
  source: "osm" | "records" | "none";
};
export type PlaceSuggestion = { name: string; detail: string | null; lat: number | null; lng: number | null; source: "records" | "osm" };

// ------------------------------------------------------------ normalisation

/** Official names for common short forms, so "Kathmandu" from OSM matches "Kathmandu Metropolitan City" in our records. */
const ALIASES: Record<string, string> = {
  kathmandu: "Kathmandu Metropolitan City",
  lalitpur: "Lalitpur Metropolitan City",
  patan: "Lalitpur Metropolitan City",
  bhaktapur: "Bhaktapur Municipality",
  pokhara: "Pokhara Metropolitan City",
  bharatpur: "Bharatpur Metropolitan City",
  biratnagar: "Biratnagar Metropolitan City",
  birgunj: "Birgunj Metropolitan City",
};
const SUFFIX = /\s+(metropolitan city|sub-?metropolitan city|rural municipality|municipality|nagarpalika|mahanagarpalika|gaunpalika)$/i;

/** Keep official names as they are; expand known short names; otherwise use the place name OSM gives us. */
export function canonicalMunicipality(raw: string | null | undefined): string | null {
  const name = raw?.replace(/\s+/g, " ").trim();
  if (!name) return null;
  if (SUFFIX.test(name)) return name.replace(/\bsub metropolitan\b/i, "Sub-Metropolitan");
  return ALIASES[name.toLowerCase()] ?? name;
}
const base = (m: string) => m.replace(SUFFIX, "").toLowerCase();

function parseWard(values: (string | undefined)[], muni: string | null): number | null {
  const text = values.filter(Boolean).join(" | ");
  const m = text.match(/ward\s*(?:no\.?|number)?\s*[-:]?\s*(\d{1,2})\b/i) ?? (muni ? text.match(new RegExp(`\\b${base(muni).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*-\\s*(\\d{1,2})\\b`, "i")) : null);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 35 ? n : null;
}

// ------------------------------------------------------------ Nominatim client

let last = 0;
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, unknown>();
const remember = (k: string, v: unknown) => {
  if (cache.size > 1000) cache.delete(cache.keys().next().value as string);
  cache.set(k, v);
};

/** Serialised + throttled to 1 request/second, as the public Nominatim policy requires. */
async function nominatim<T>(path: string): Promise<T | null> {
  if (!enabled()) return null;
  const key = path;
  if (cache.has(key)) return cache.get(key) as T;
  const run = queue.then(async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const r = await fetch(`${BASE}${path}`, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" }, signal: AbortSignal.timeout(6000) });
      if (!r.ok) return null;
      const json = (await r.json()) as T;
      remember(key, json);
      return json;
    } catch {
      return null; // offline or slow: callers fall back to local records
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

type OsmAddress = Partial<Record<"road" | "pedestrian" | "neighbourhood" | "suburb" | "quarter" | "city_district" | "city" | "municipality" | "town" | "village" | "county" | "state" | "country_code", string>>;
type OsmResult = { lat: string; lon: string; display_name: string; name?: string; address?: OsmAddress; error?: string };

// ------------------------------------------------------------ reverse

async function nearestKnownMunicipality(p: LatLng): Promise<string | null> {
  const box = boundingBox(p, 5);
  const sel = { municipality: true, latitude: true, longitude: true } as const;
  const notNull = { municipality: { not: null } };
  const rows = (
    await Promise.all([
      prisma.veterinaryClinic.findMany({ where: { ...bboxWhere(box, "latitude", "longitude"), ...notNull }, select: sel, take: 50 }),
      prisma.rescueOrganization.findMany({ where: { ...bboxWhere(box, "latitude", "longitude"), ...notNull }, select: sel, take: 50 }),
      prisma.biteIncident.findMany({ where: { ...bboxWhere(box, "latitude", "longitude"), ...notNull }, select: sel, take: 200 }),
    ])
  ).flat();
  let best: { m: string; d: number } | null = null;
  for (const r of rows) {
    const d = haversineKm(p, { lat: r.latitude, lng: r.longitude });
    if (r.municipality && (!best || d < best.d)) best = { m: r.municipality, d };
  }
  return best?.m ?? null;
}

export async function reverseGeocode(p: LatLng): Promise<Place> {
  const osm = await nominatim<OsmResult>(`/reverse?format=jsonv2&lat=${p.lat.toFixed(5)}&lon=${p.lng.toFixed(5)}&zoom=18&addressdetails=1`);
  if (osm?.address && !osm.error) {
    const a = osm.address;
    const municipality = canonicalMunicipality(a.city ?? a.municipality ?? a.town ?? a.village ?? a.county);
    const wardNumber = parseWard([a.suburb, a.quarter, a.city_district, a.neighbourhood, osm.display_name], municipality);
    const street = a.road ?? a.pedestrian;
    const area = a.neighbourhood ?? a.quarter ?? a.suburb;
    const address = [...new Set([street, area].filter(Boolean))].join(", ") || osm.name || null;
    const label = [address, wardNumber ? `Ward ${wardNumber}` : null, municipality].filter(Boolean).join(", ") || osm.display_name;
    return { municipality, wardNumber, address, label, inNepal: (a.country_code ?? "np") === "np", source: "osm" };
  }
  const municipality = await nearestKnownMunicipality(p);
  return { municipality, wardNumber: null, address: null, label: municipality ? `Near ${municipality}` : "", inNepal: true, source: municipality ? "records" : "none" };
}

// ------------------------------------------------------------ search / list

/** Every municipality that appears in our data, with how many records reference it. */
export async function knownMunicipalities() {
  const groups = await Promise.all([
    prisma.user.groupBy({ by: ["municipality"], where: { municipality: { not: null } }, _count: { _all: true } }),
    prisma.veterinaryClinic.groupBy({ by: ["municipality"], where: { municipality: { not: null } }, _count: { _all: true } }),
    prisma.rescueOrganization.groupBy({ by: ["municipality"], where: { municipality: { not: null } }, _count: { _all: true } }),
    prisma.communityStray.groupBy({ by: ["municipality"], where: { municipality: { not: null } }, _count: { _all: true } }),
    prisma.biteIncident.groupBy({ by: ["municipality"], where: { municipality: { not: null } }, _count: { _all: true } }),
  ]);
  const counts = new Map<string, number>();
  for (const g of groups.flat()) if (g.municipality) counts.set(g.municipality, (counts.get(g.municipality) ?? 0) + g._count._all);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, records]) => ({ name, records }));
}

/**
 * Suggestions come from municipalities we already know (cheap, works offline, fine per keystroke).
 * OpenStreetMap is consulted only on an explicit lookup (lookup=true, e.g. when the field loses focus):
 * Nominatim has no prefix search and its usage policy forbids search-as-you-type.
 */
export async function searchPlaces(q: string, lookup = false): Promise<PlaceSuggestion[]> {
  const needle = q.trim().toLowerCase();
  const known = (await knownMunicipalities()).filter((m) => !needle || m.name.toLowerCase().includes(needle)).slice(0, 8);
  const out: PlaceSuggestion[] = known.map((m) => ({ name: m.name, detail: `${m.records} record${m.records === 1 ? "" : "s"} in the system`, lat: null, lng: null, source: "records" }));
  if (lookup && needle.length >= 3) {
    const osm = await nominatim<OsmResult[]>(`/search?format=jsonv2&addressdetails=1&countrycodes=np&limit=8&featureType=settlement&q=${encodeURIComponent(q.trim())}`);
    for (const r of osm ?? []) {
      const a = r.address ?? {};
      const name = canonicalMunicipality(a.city ?? a.municipality ?? a.town ?? a.village ?? r.name ?? a.county);
      if (!name || out.some((o) => base(o.name) === base(name))) continue;
      out.push({ name, detail: [a.county, a.state].filter(Boolean).join(", ") || null, lat: Number(r.lat), lng: Number(r.lon), source: "osm" });
    }
  }
  return out.slice(0, 12);
}
