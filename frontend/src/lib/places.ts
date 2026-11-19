import useSWR from "swr";
import { api, qs } from "@/lib/api";
import type { LatLng } from "@/lib/geo";

/** Result of GET /geo/reverse: what is at a map pin (OpenStreetMap, or our own records when offline). */
export type Place = {
  municipality: string | null;
  wardNumber: number | null;
  address: string | null;
  label: string;
  inNepal: boolean;
  source: "osm" | "records" | "none";
};
export type PlaceSuggestion = { name: string; detail: string | null; lat: number | null; lng: number | null; source: "records" | "osm" };

export function reverseGeocode(p: LatLng) {
  return api<Place>(`/geo/reverse${qs({ lat: p.lat.toFixed(5), lng: p.lng.toFixed(5) })}`);
}

export function lookupPlace(q: string) {
  return api<{ data: PlaceSuggestion[] }>(`/geo/places${qs({ q, lookup: "true" })}`).then((r) => r.data);
}

/** Municipalities that exist in the data, for filter dropdowns (no hardcoded list). */
export function useMunicipalityOptions() {
  const { data } = useSWR<{ data: { name: string; records: number }[] }>("/geo/municipalities", { revalidateOnFocus: false });
  return (data?.data ?? []).map((m) => ({ value: m.name, label: shortMunicipality(m.name) }));
}

export const shortMunicipality = (m: string | null | undefined) =>
  m?.replace(/ (Sub-)?Metropolitan City$/, "").replace(/ (Rural )?Municipality$/, "") ?? "";

/** Device GPS → Promise. */
export function currentPosition(): Promise<{ p: LatLng; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location is not available on this device"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ p: { lat: pos.coords.latitude, lng: pos.coords.longitude }, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? "Location permission denied" : "Could not get your location")),
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  });
}
