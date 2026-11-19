// Client-side geometry for the map's radius filter. The authoritative spatial
// queries (bbox + haversine, DBSCAN, risk grid) run on the API — this mirrors
// only the distance formula so filtering already-loaded markers is instant.

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in kilometres (same constants as backend/src/services/geo.ts). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
