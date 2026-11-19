export type Feature<P> = {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: P;
};

export type FeatureCollection<P> = { type: "FeatureCollection"; features: Feature<P>[] };

/** GeoJSON uses [lng, lat] order — Leaflet's L.geoJSON consumes this directly. */
export function point<P>(id: string, lat: number, lng: number, properties: P): Feature<P> {
  return { type: "Feature", id, geometry: { type: "Point", coordinates: [lng, lat] }, properties };
}

export function collection<P>(features: Feature<P>[]): FeatureCollection<P> {
  return { type: "FeatureCollection", features };
}
