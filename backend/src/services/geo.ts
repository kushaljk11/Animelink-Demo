// Geospatial engine (Section S). Replaces PostGIS for the local SQLite build:
//   ST_DWithin      → boundingBox() pre-filter in SQL + haversineKm() refinement
//   ST_ClusterDBSCAN→ dbscan()
//   risk areas      → riskGrid() (reported-incident concentration, not diagnosis)

export type LatLng = { lat: number; lng: number };
export type BBox = { minLat: number; maxLat: number; minLng: number; maxLng: number };

const EARTH_RADIUS_KM = 6371.0088;
const KM_PER_DEG_LAT = 111.32;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Smallest lat/lng box containing a circle; used to narrow the SQL scan before exact distance. */
export function boundingBox(center: LatLng, radiusKm: number): BBox {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const cos = Math.max(Math.cos(toRad(center.lat)), 1e-6);
  const dLng = radiusKm / (KM_PER_DEG_LAT * cos);
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

/** Prisma `where` fragment for a bounding box on arbitrary lat/lng columns. */
export function bboxWhere<LatK extends string, LngK extends string>(box: BBox, latKey: LatK, lngKey: LngK) {
  return {
    [latKey]: { gte: box.minLat, lte: box.maxLat },
    [lngKey]: { gte: box.minLng, lte: box.maxLng },
  } as Record<LatK | LngK, { gte: number; lte: number }>;
}

/** Exact radius filter + distance annotation, nearest first. */
export function withinRadius<T>(
  items: T[],
  center: LatLng,
  radiusKm: number,
  getPoint: (item: T) => LatLng | null,
): (T & { distanceKm: number })[] {
  const out: (T & { distanceKm: number })[] = [];
  for (const item of items) {
    const p = getPoint(item);
    if (!p) continue;
    const d = haversineKm(center, p);
    if (d <= radiusKm) out.push({ ...item, distanceKm: Math.round(d * 1000) / 1000 });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

export function centroid(points: LatLng[]): LatLng {
  if (!points.length) throw new Error("centroid of empty set");
  // Mean of unit vectors: correct for any spread, unlike naive lat/lng averaging.
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    const la = toRad(p.lat);
    const lo = toRad(p.lng);
    x += Math.cos(la) * Math.cos(lo);
    y += Math.cos(la) * Math.sin(lo);
    z += Math.sin(la);
  }
  const n = points.length;
  x /= n;
  y /= n;
  z /= n;
  return {
    lat: (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI,
    lng: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

/** Round coordinates for public display (3 dp ≈ 110 m) — Section U location privacy. */
export function coarsen(p: LatLng, decimals = 3): LatLng {
  const f = 10 ** decimals;
  return { lat: Math.round(p.lat * f) / f, lng: Math.round(p.lng * f) / f };
}

// ------------------------------------------------------------------ DBSCAN ---

export type ClusterPoint<T> = LatLng & { item: T };
export type Cluster<T> = {
  id: number;
  count: number;
  center: LatLng;
  /** Distance from centre to the farthest member, km (for drawing a circle). */
  radiusKm: number;
  bbox: BBox;
  members: T[];
};

/**
 * Density-based clustering on great-circle distance. Uses a uniform grid with
 * cell size = eps so each neighbourhood query only checks 9 cells.
 */
export function dbscan<T>(points: ClusterPoint<T>[], epsKm: number, minPts: number): { clusters: Cluster<T>[]; noise: T[] } {
  const n = points.length;
  if (n === 0) return { clusters: [], noise: [] };

  const refLat = points.reduce((s, p) => s + p.lat, 0) / n;
  const cellLat = epsKm / KM_PER_DEG_LAT;
  const cellLng = epsKm / (KM_PER_DEG_LAT * Math.max(Math.cos(toRad(refLat)), 1e-6));
  const key = (i: number, j: number) => `${i}:${j}`;
  const grid = new Map<string, number[]>();
  const cellOf = points.map((p) => [Math.floor(p.lat / cellLat), Math.floor(p.lng / cellLng)] as const);
  cellOf.forEach(([i, j], idx) => {
    const k = key(i, j);
    const bucket = grid.get(k);
    if (bucket) bucket.push(idx);
    else grid.set(k, [idx]);
  });

  const neighbours = (idx: number): number[] => {
    const [ci, cj] = cellOf[idx]!;
    const res: number[] = [];
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const other of grid.get(key(ci + di, cj + dj)) ?? []) {
          if (haversineKm(points[idx]!, points[other]!) <= epsKm) res.push(other);
        }
      }
    }
    return res;
  };

  const UNVISITED = -2;
  const NOISE = -1;
  const label = new Array<number>(n).fill(UNVISITED);
  let clusterId = 0;

  for (let i = 0; i < n; i++) {
    if (label[i] !== UNVISITED) continue;
    const seeds = neighbours(i);
    if (seeds.length < minPts) {
      label[i] = NOISE;
      continue;
    }
    label[i] = clusterId;
    const queue = seeds.filter((s) => s !== i);
    while (queue.length) {
      const q = queue.shift()!;
      if (label[q] === NOISE) label[q] = clusterId; // border point
      if (label[q] !== UNVISITED) continue;
      label[q] = clusterId;
      const qn = neighbours(q);
      if (qn.length >= minPts) queue.push(...qn);
    }
    clusterId++;
  }

  const groups = new Map<number, ClusterPoint<T>[]>();
  const noise: T[] = [];
  label.forEach((l, idx) => {
    if (l < 0) {
      noise.push(points[idx]!.item);
      return;
    }
    const g = groups.get(l);
    if (g) g.push(points[idx]!);
    else groups.set(l, [points[idx]!]);
  });

  const clusters: Cluster<T>[] = [...groups.entries()].map(([cid, members]) => {
    const center = centroid(members);
    const radiusKm = Math.max(...members.map((m) => haversineKm(center, m)));
    return {
      id: cid,
      count: members.length,
      center,
      radiusKm: Math.round(Math.max(radiusKm, 0.05) * 1000) / 1000,
      bbox: {
        minLat: Math.min(...members.map((m) => m.lat)),
        maxLat: Math.max(...members.map((m) => m.lat)),
        minLng: Math.min(...members.map((m) => m.lng)),
        maxLng: Math.max(...members.map((m) => m.lng)),
      },
      members: members.map((m) => m.item),
    };
  });
  clusters.sort((a, b) => b.count - a.count);
  clusters.forEach((c, i) => (c.id = i + 1));
  return { clusters, noise };
}

// --------------------------------------------------------------- risk grid ---

export type ActivityLevel = "LOW" | "MODERATE" | "HIGH";
export type RiskInput = LatLng & { suspectedRabies: boolean; severity: "LOW" | "MODERATE" | "HIGH" };
export type RiskCell = {
  cellId: string;
  center: LatLng;
  bounds: BBox;
  count: number;
  suspectedCount: number;
  highSeverityCount: number;
  score: number;
  level: ActivityLevel;
};

/**
 * Buckets reports into ~cellKm squares and grades *reported activity*
 * (Section S: "not a medical diagnosis or confirmed rabies risk").
 * score = reports + 1.0 × suspected-rabies + 0.5 × high-severity
 */
export function riskGrid(
  points: RiskInput[],
  cellKm = 1,
  thresholds: { moderate: number; high: number } = { moderate: 3, high: 6 },
): RiskCell[] {
  if (!points.length) return [];
  const refLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const cellLat = cellKm / KM_PER_DEG_LAT;
  const cellLng = cellKm / (KM_PER_DEG_LAT * Math.max(Math.cos(toRad(refLat)), 1e-6));
  const cells = new Map<string, { i: number; j: number; pts: RiskInput[] }>();
  for (const p of points) {
    const i = Math.floor(p.lat / cellLat);
    const j = Math.floor(p.lng / cellLng);
    const k = `${i}:${j}`;
    const c = cells.get(k);
    if (c) c.pts.push(p);
    else cells.set(k, { i, j, pts: [p] });
  }
  const out: RiskCell[] = [];
  for (const [cellId, { i, j, pts }] of cells) {
    const suspectedCount = pts.filter((p) => p.suspectedRabies).length;
    const highSeverityCount = pts.filter((p) => p.severity === "HIGH").length;
    const score = pts.length + suspectedCount + 0.5 * highSeverityCount;
    const bounds = { minLat: i * cellLat, maxLat: (i + 1) * cellLat, minLng: j * cellLng, maxLng: (j + 1) * cellLng };
    out.push({
      cellId,
      center: { lat: (bounds.minLat + bounds.maxLat) / 2, lng: (bounds.minLng + bounds.maxLng) / 2 },
      bounds,
      count: pts.length,
      suspectedCount,
      highSeverityCount,
      score,
      level: score >= thresholds.high ? "HIGH" : score >= thresholds.moderate ? "MODERATE" : "LOW",
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
