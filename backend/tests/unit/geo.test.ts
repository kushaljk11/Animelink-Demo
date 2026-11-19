// Geospatial engine (Section Y.4): fixed-coordinate checks against independent maths.
import { describe, expect, it } from "vitest";
import { boundingBox, centroid, coarsen, dbscan, haversineKm, riskGrid, withinRadius, type LatLng } from "@/services/geo";

const R = 6371.0088; // mean Earth radius used by the engine (km)
const KM_PER_DEG = (R * Math.PI) / 180; // ≈ 111.19508 km

/** Spherical law of cosines — an independent formula to cross-check haversine. */
function lawOfCosinesKm(a: LatLng, b: LatLng) {
  const r = Math.PI / 180;
  const v = Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return R * Math.acos(Math.min(1, Math.max(-1, v)));
}

/** Point `km` north of `p` (meridian arcs are exact great circles). */
const north = (p: LatLng, km: number): LatLng => ({ lat: p.lat + km / KM_PER_DEG, lng: p.lng });

const KATHMANDU = { lat: 27.7172, lng: 85.324 };
const POKHARA = { lat: 28.2096, lng: 83.9856 };
const BHAKTAPUR = { lat: 27.671, lng: 85.4298 };

describe("haversineKm", () => {
  it("is zero for identical points", () => {
    expect(haversineKm(KATHMANDU, KATHMANDU)).toBe(0);
  });

  it("matches one degree of latitude / equatorial longitude (≈111.195 km)", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.195, 3);
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.195, 3);
    expect(haversineKm({ lat: 27.7, lng: 85.3 }, { lat: 27.8, lng: 85.3 })).toBeCloseTo(11.1195, 3);
  });

  it("shrinks longitude distance with latitude (1° at 60°N ≈ 55.597 km)", () => {
    expect(haversineKm({ lat: 60, lng: 0 }, { lat: 60, lng: 1 })).toBeCloseTo(55.597, 2);
  });

  it("returns half the circumference for antipodal points", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(Math.PI * R, 6);
  });

  it("is symmetric and agrees with the spherical law of cosines", () => {
    for (const [a, b] of [[KATHMANDU, POKHARA], [KATHMANDU, BHAKTAPUR], [POKHARA, BHAKTAPUR]] as const) {
      expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
      expect(haversineKm(a, b)).toBeCloseTo(lawOfCosinesKm(a, b), 6);
    }
    // Real-world sanity: Kathmandu–Pokhara straight line is ~140 km, Kathmandu–Bhaktapur ~11.5 km.
    expect(haversineKm(KATHMANDU, POKHARA)).toBeGreaterThan(138);
    expect(haversineKm(KATHMANDU, POKHARA)).toBeLessThan(145);
    expect(haversineKm(KATHMANDU, BHAKTAPUR)).toBeGreaterThan(11);
    expect(haversineKm(KATHMANDU, BHAKTAPUR)).toBeLessThan(12);
  });
});

describe("boundingBox", () => {
  it("contains every point within the radius (no false negatives for the SQL pre-filter)", () => {
    const radius = 5;
    const box = boundingBox(KATHMANDU, radius);
    for (let dLat = -0.06; dLat <= 0.06; dLat += 0.004) {
      for (let dLng = -0.07; dLng <= 0.07; dLng += 0.004) {
        const p = { lat: KATHMANDU.lat + dLat, lng: KATHMANDU.lng + dLng };
        if (haversineKm(KATHMANDU, p) <= radius) {
          expect(p.lat).toBeGreaterThanOrEqual(box.minLat);
          expect(p.lat).toBeLessThanOrEqual(box.maxLat);
          expect(p.lng).toBeGreaterThanOrEqual(box.minLng);
          expect(p.lng).toBeLessThanOrEqual(box.maxLng);
        }
      }
    }
  });

  it("is wider in longitude than latitude away from the equator", () => {
    const box = boundingBox(KATHMANDU, 10);
    expect(box.maxLng - box.minLng).toBeGreaterThan(box.maxLat - box.minLat);
  });
});

describe("withinRadius", () => {
  const items = [
    { id: "centre", ...KATHMANDU },
    { id: "1.0km", ...north(KATHMANDU, 1.0) },
    { id: "1.99km", ...north(KATHMANDU, 1.99) },
    { id: "2.01km", ...north(KATHMANDU, 2.01) },
    { id: "no-location", lat: Number.NaN, lng: Number.NaN },
  ];
  const get = (i: (typeof items)[number]) => (Number.isNaN(i.lat) ? null : { lat: i.lat, lng: i.lng });

  it("keeps only points inside the radius, nearest first, with distances", () => {
    const res = withinRadius(items, KATHMANDU, 2, get);
    expect(res.map((r) => r.id)).toEqual(["centre", "1.0km", "1.99km"]);
    expect(res[1]!.distanceKm).toBeCloseTo(1.0, 3);
    expect(res[2]!.distanceKm).toBeCloseTo(1.99, 3);
  });

  it("treats the radius boundary as inclusive and skips items without a location", () => {
    const res = withinRadius(items, KATHMANDU, 2.01, get);
    expect(res.map((r) => r.id)).toContain("2.01km");
    expect(res.map((r) => r.id)).not.toContain("no-location");
  });
});

describe("dbscan (incident cluster detection)", () => {
  const around = (c: LatLng, n: number, stepKm: number, tag: string) =>
    Array.from({ length: n }, (_, i) => ({ ...north(c, i * stepKm), item: `${tag}${i}` }));
  const kalanki = { lat: 27.6935, lng: 85.2817 };
  const koteshwor = { lat: 27.6789, lng: 85.3494 };
  const points = [
    ...around(kalanki, 5, 0.05, "A"), // 5 reports within 200 m
    ...around(koteshwor, 3, 0.05, "B"), // 3 reports within 100 m
    { ...BHAKTAPUR, item: "noise1" },
    { ...north(KATHMANDU, 3), item: "noise2" },
  ];

  it("finds both concentrations and labels isolated reports as noise", () => {
    const { clusters, noise } = dbscan(points, 0.3, 3);
    expect(clusters.map((c) => c.count)).toEqual([5, 3]);
    expect(clusters.map((c) => c.id)).toEqual([1, 2]);
    expect(clusters[0]!.members.every((m) => m.startsWith("A"))).toBe(true);
    expect(noise.sort()).toEqual(["noise1", "noise2"]);
  });

  it("puts cluster centres inside their members and reports a covering radius", () => {
    const { clusters } = dbscan(points, 0.3, 3);
    const a = clusters[0]!;
    expect(haversineKm(a.center, kalanki)).toBeLessThan(0.2);
    expect(a.radiusKm).toBeGreaterThanOrEqual(0.1);
    expect(a.radiusKm).toBeLessThan(0.25);
  });

  it("respects minPts", () => {
    const { clusters, noise } = dbscan(points, 0.3, 4);
    expect(clusters).toHaveLength(1);
    expect(noise).toHaveLength(5);
  });

  it("handles empty input", () => {
    expect(dbscan([], 0.5, 3)).toEqual({ clusters: [], noise: [] });
  });
});

describe("riskGrid (reported-activity levels)", () => {
  const cell = (c: LatLng, n: number, suspected: number, high: number) =>
    Array.from({ length: n }, (_, i) => ({ ...c, suspectedRabies: i < suspected, severity: (i < high ? "HIGH" : "LOW") as "HIGH" | "LOW" }));

  it("grades cells by reports + suspected + 0.5 × high severity", () => {
    const cells = riskGrid(
      [
        ...cell({ lat: 27.6, lng: 85.2 }, 2, 0, 0), // score 2   → LOW
        ...cell({ lat: 27.65, lng: 85.3 }, 3, 0, 0), // score 3  → MODERATE
        ...cell({ lat: 27.7, lng: 85.4 }, 3, 3, 3), // score 7.5 → HIGH
      ],
      1,
    );
    const byScore = Object.fromEntries(cells.map((c) => [c.score, c.level]));
    expect(byScore).toEqual({ 2: "LOW", 3: "MODERATE", 7.5: "HIGH" });
    expect(cells[0]!.level).toBe("HIGH"); // sorted by score, highest first
  });

  it("returns nothing for no input", () => {
    expect(riskGrid([], 1)).toEqual([]);
  });
});

describe("centroid / coarsen", () => {
  it("centroid of symmetric points is the midpoint", () => {
    const c = centroid([north(KATHMANDU, -1), north(KATHMANDU, 1)]);
    expect(c.lat).toBeCloseTo(KATHMANDU.lat, 6);
    expect(c.lng).toBeCloseTo(KATHMANDU.lng, 6);
  });

  it("coarsens to 3 decimals (≈110 m) for public display", () => {
    expect(coarsen({ lat: 27.71234, lng: 85.31876 })).toEqual({ lat: 27.712, lng: 85.319 });
  });
});
