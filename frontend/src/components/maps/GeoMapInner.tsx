"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Crosshair, Layers, LocateFixed, Radar, Ruler, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Popup, Rectangle, TileLayer, useMap, useMapEvents } from "react-leaflet";
import Supercluster from "supercluster";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/primitives";
import { StatusPill } from "@/components/ui/status-pill";
import { qs } from "@/lib/api";
import { haversineKm, type LatLng } from "@/lib/geo";
import { cn, formatDate, titleCase } from "@/lib/utils";
import { clusterIcon, dotIcon, LAYER_META, LEVEL_COLOR, TILE_ATTRIBUTION, TILE_URL, VALLEY_CENTER, type LayerKey } from "./shared";

type Props = Record<string, unknown>;
type GeoFeature = { type: "Feature"; id: string; geometry: { type: "Point"; coordinates: [number, number] }; properties: Props };
type MapResponse = { layers: Partial<Record<LayerKey, { features: GeoFeature[] }>>; hidden: string[] };
type ClusterResp = { clusters: { id: number; level: string; count: number; suspectedRabies: number; highSeverity: number; center: LatLng; radiusKm: number; wards: string[]; firstReport: string; lastReport: string }[]; totals: { incidents: number; clusters: number } };
type RiskResp = { cells: { cellId: string; level: string; count: number; suspectedCount: number; bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } }[] };

type Point = { layer: LayerKey; id: string; lat: number; lng: number; props: Props };

export type GeoMapProps = {
  layers: LayerKey[];
  defaultLayers?: LayerKey[];
  analysis?: boolean;
  publicMode?: boolean;
  focus?: LatLng | null;
  defaultRadiusKm?: number | null;
  className?: string;
};

const RADII = [1, 2, 5, 10, 25];
const TABLE_ROUTE: Partial<Record<LayerKey, string>> = { incidents: "/app/incidents", strays: "/app/strays", cnvr: "/app/cnvr", clinics: "/app/clinics", shelters: "/app/organizations" };

function iconFor(p: Point) {
  const meta = LAYER_META[p.layer];
  if (p.layer === "incidents") {
    const suspected = p.props.suspectedRabies === true;
    const color = suspected ? "var(--danger)" : p.props.severity === "HIGH" ? "var(--warning)" : "var(--info)";
    return dotIcon(color, { pulse: suspected && p.props.status !== "RESOLVED" && p.props.status !== "DISMISSED" });
  }
  if (p.layer === "strays") return dotIcon(p.props.sterilized ? "var(--success)" : "var(--warning)", { size: 12 });
  if (p.layer === "lost") return dotIcon(meta.color, { size: 18, glyph: meta.glyph, pulse: true });
  return dotIcon(meta.color, { size: p.layer === "cnvr" ? 12 : 18, glyph: meta.glyph });
}

function PopupBody({ p, publicMode }: { p: Point; publicMode?: boolean }) {
  const pr = p.props as Record<string, string | number | boolean | null>;
  const tableHref = TABLE_ROUTE[p.layer];
  const meta = LAYER_META[p.layer];
  return (
    <div className="min-w-52 space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted">
        <span className="size-2 rounded-full" style={{ background: meta.color }} />
        {meta.label}
      </div>
      {p.layer === "incidents" && (
        <>
          <p className="font-semibold text-fg">{titleCase(String(pr.animalType))} bite · {titleCase(String(pr.severity))}</p>
          <div className="flex flex-wrap gap-1.5">
            <StatusPill status={String(pr.status)} />
            {pr.suspectedRabies && <StatusPill status="HIGH" label="Suspected rabies" live />}
          </div>
          <p className="text-xs text-muted">{formatDate(String(pr.incidentDate))}{pr.wardNumber ? ` · Ward ${pr.wardNumber}` : ""}{pr.municipality ? `, ${String(pr.municipality).replace(" Metropolitan City", "")}` : ""}</p>
        </>
      )}
      {p.layer === "strays" && (
        <>
          <p className="font-semibold text-fg">{pr.tagOrEarMark ? String(pr.tagOrEarMark) : "Unmarked stray"}</p>
          <p className="text-xs text-muted">{titleCase(String(pr.color ?? "unknown colour"))} · {titleCase(String(pr.gender))}</p>
          <div className="flex gap-1.5">
            <StatusPill status={pr.sterilized ? "VERIFIED" : "PENDING"} label={pr.sterilized ? "Sterilised" : "Not sterilised"} />
            <StatusPill status={pr.vaccinated ? "VERIFIED" : "PENDING"} label={pr.vaccinated ? "Vaccinated" : "Not vaccinated"} />
          </div>
        </>
      )}
      {p.layer === "cnvr" && (
        <>
          <p className="font-semibold text-fg">Released {formatDate(String(pr.releaseDate))}</p>
          <p className="text-xs text-muted">{String(pr.organizationName)}</p>
          <p className="text-xs text-muted">{pr.sterilizationDate ? "Sterilised" : "Not sterilised"} · {pr.vaccinationDate ? "Vaccinated" : "Not vaccinated"}</p>
        </>
      )}
      {(p.layer === "clinics" || p.layer === "shelters") && (
        <>
          <p className="font-semibold text-fg">{String(pr.clinicName ?? pr.organizationName)}</p>
          <p className="text-xs text-muted">{String(pr.address)}</p>
          {pr.openingHours && <p className="text-xs text-muted">{String(pr.openingHours)}</p>}
          <a href={`tel:${String(pr.phone)}`} className="text-xs font-medium text-accent">{String(pr.phone)}</a>
        </>
      )}
      {p.layer === "lost" && (
        <>
          <p className="font-semibold text-fg">{String(pr.petName)} · {titleCase(String(pr.species))}</p>
          <p className="text-xs text-muted">Last seen {formatDate(String(pr.lastSeenDate))} (approximate area)</p>
          <a href={String(pr.profilePath)} className="text-xs font-medium text-accent">Open pet profile & contact owner →</a>
        </>
      )}
      {typeof pr.distanceKm === "number" && <p className="text-xs font-medium text-fg-soft">{pr.distanceKm.toFixed(2)} km from centre</p>}
      {!publicMode && tableHref && (
        <Link href={`${tableHref}?open=${p.id}`} className="inline-flex text-xs font-medium text-accent hover:underline">
          View in table →
        </Link>
      )}
    </div>
  );
}

/** Re-clusters visible points on every pan/zoom with supercluster. */
function ClusteredMarkers({ points, publicMode }: { points: Point[]; publicMode?: boolean }) {
  const map = useMap();
  const index = useMemo(() => {
    const sc = new Supercluster<{ idx: number }>({ radius: 56, maxZoom: 16 });
    sc.load(points.map((p, idx) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: { idx } })));
    return sc;
  }, [points]);
  const [view, setView] = useState(() => ({ bounds: map.getBounds(), zoom: map.getZoom() }));
  useMapEvents({ moveend: () => setView({ bounds: map.getBounds(), zoom: map.getZoom() }) });

  const items = index.getClusters([view.bounds.getWest(), view.bounds.getSouth(), view.bounds.getEast(), view.bounds.getNorth()], Math.round(view.zoom));
  return (
    <>
      {items.map((c) => {
        const [lng, lat] = c.geometry.coordinates as [number, number];
        const props = c.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; idx?: number };
        if (props.cluster) {
          return (
            <Marker
              key={`c${props.cluster_id}`}
              position={[lat, lng]}
              icon={clusterIcon(props.point_count ?? 0)}
              eventHandlers={{ click: () => map.flyTo([lat, lng], Math.min(index.getClusterExpansionZoom(props.cluster_id!), 18), { duration: 0.5 }) }}
            />
          );
        }
        const p = points[props.idx!]!;
        return (
          <Marker key={`${p.layer}:${p.id}`} position={[p.lat, p.lng]} icon={iconFor(p)}>
            <Popup>
              <PopupBody p={p} publicMode={publicMode} />
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

function RadiusPicker({ active, onPick }: { active: boolean; onPick: (p: LatLng) => void }) {
  useMapEvents({
    click: (e) => {
      if (active) onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function FitOnce({ points, focus }: { points: Point[]; focus?: LatLng | null }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    if (focus) {
      map.setView([focus.lat, focus.lng], 15);
      done.current = true;
    } else if (points.length) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])).pad(0.08), { maxZoom: 14 });
      done.current = true;
    }
  }, [map, points, focus]);
  return null;
}

function FlyTo({ target }: { target: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [map, target]);
  return null;
}

export default function GeoMapInner({ layers, defaultLayers, analysis, publicMode, focus, defaultRadiusKm = null, className }: GeoMapProps) {
  const [enabled, setEnabled] = useState<LayerKey[]>(defaultLayers ?? layers);
  const [days, setDays] = useState<number>(30);
  const [radiusKm, setRadiusKm] = useState<number | null>(defaultRadiusKm ?? (focus ? 2 : null));
  const [center, setCenter] = useState<LatLng | null>(focus ?? null);
  const [picking, setPicking] = useState(false);
  const [showClusters, setShowClusters] = useState(analysis ?? false);
  const [showRisk, setShowRisk] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  // Stable per date-range choice: recomputing from Date.now() each render would change the SWR key and refetch forever.
  const from = useMemo(() => (days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined), [days]);
  // Date window applies to time-based layers only; directory layers are always current.
  const timeLayers = enabled.filter((l) => ["incidents", "strays", "cnvr"].includes(l));
  const staticLayers = enabled.filter((l) => !timeLayers.includes(l));
  const { data: timeData, isLoading: l1 } = useSWR<MapResponse>(timeLayers.length ? `/geo/map${qs({ layers: timeLayers.join(","), from })}` : null, { keepPreviousData: true });
  const { data: staticData, isLoading: l2 } = useSWR<MapResponse>(staticLayers.length ? `/geo/map${qs({ layers: staticLayers.join(",") })}` : null, { keepPreviousData: true });
  const { data: clusters } = useSWR<ClusterResp>(analysis && showClusters ? `/geo/clusters${qs({ from })}` : null);
  const { data: risk } = useSWR<RiskResp>(analysis && showRisk ? `/geo/risk-areas${qs({ from })}` : null);

  const allPoints = useMemo<Point[]>(() => {
    const out: Point[] = [];
    for (const src of [timeData, staticData]) {
      for (const [layer, fc] of Object.entries(src?.layers ?? {}) as [LayerKey, { features: GeoFeature[] }][]) {
        if (!enabled.includes(layer)) continue;
        for (const f of fc.features) out.push({ layer, id: String(f.id), lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], props: f.properties });
      }
    }
    return out;
  }, [timeData, staticData, enabled]);

  // Radius filter: exact great-circle distance via the shared haversine engine.
  const points = useMemo<Point[]>(() => {
    if (!center || !radiusKm) return allPoints;
    return allPoints
      .map((p): Point => ({ ...p, props: { ...p.props, distanceKm: haversineKm(center, p) } as Props }))
      .filter((p) => (p.props.distanceKm as number) <= radiusKm)
      .sort((a, b) => (a.props.distanceKm as number) - (b.props.distanceKm as number));
  }, [allPoints, center, radiusKm]);

  const counts = useMemo(() => {
    const c: Partial<Record<LayerKey, number>> = {};
    for (const p of points) c[p.layer] = (c[p.layer] ?? 0) + 1;
    return c;
  }, [points]);

  const hidden = [...(timeData?.hidden ?? []), ...(staticData?.hidden ?? [])];
  const loading = (l1 && !timeData) || (l2 && !staticData);

  const locate = useCallback(() => {
    if (!navigator.geolocation) return toast.error("Geolocation is not available in this browser");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setRadiusKm((r) => r ?? 5);
        toast.success(`Location found (±${Math.round(pos.coords.accuracy)} m)`);
      },
      () => toast.error("Could not get your location — click the map to set a centre instead"),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  const toggleLayer = (l: LayerKey) => setEnabled((e) => (e.includes(l) ? e.filter((x) => x !== l) : [...e, l]));

  return (
    <div className={cn("relative isolate overflow-hidden rounded-xl border border-border bg-surface-2", className)}>
      <MapContainer center={focus ? [focus.lat, focus.lng] : VALLEY_CENTER} zoom={focus ? 15 : 12} className={cn("h-full w-full", picking && "cursor-crosshair")} zoomControl={false}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} className="rtn-tiles" maxZoom={19} />
        <FitOnce points={allPoints} focus={focus} />
        <FlyTo target={center} />
        <RadiusPicker
          active={picking}
          onPick={(p) => {
            setCenter(p);
            setRadiusKm((r) => r ?? 2);
            setPicking(false);
          }}
        />
        {showRisk &&
          risk?.cells.map((c) => (
            <Rectangle
              key={c.cellId}
              bounds={[[c.bounds.minLat, c.bounds.minLng], [c.bounds.maxLat, c.bounds.maxLng]]}
              pathOptions={{ color: LEVEL_COLOR[c.level], weight: 1, fillOpacity: c.level === "HIGH" ? 0.28 : c.level === "MODERATE" ? 0.18 : 0.08 }}
            >
              <Popup>
                <p className="font-semibold">{titleCase(c.level)} reported activity</p>
                <p className="text-xs text-muted">{c.count} reports · {c.suspectedCount} suspected rabies (≈1 km cell)</p>
              </Popup>
            </Rectangle>
          ))}
        {showClusters &&
          clusters?.clusters.map((c) => (
            <Circle key={c.id} center={[c.center.lat, c.center.lng]} radius={Math.max(c.radiusKm * 1000, 120)} pathOptions={{ color: LEVEL_COLOR[c.level], weight: 2, dashArray: "6 4", fillOpacity: 0.12 }}>
              <Popup>
                <div className="space-y-1.5">
                  <p className="font-semibold text-fg">Incident cluster #{c.id}</p>
                  <StatusPill status={c.level} label={`${titleCase(c.level)} activity`} live={c.level === "HIGH"} />
                  <p className="text-xs text-muted">{c.count} reports · {c.suspectedRabies} suspected rabies · {c.highSeverity} high severity</p>
                  <p className="text-xs text-muted">{formatDate(c.firstReport)} – {formatDate(c.lastReport)}</p>
                  {c.wards.length > 0 && <p className="text-xs text-muted">{c.wards.join(", ")}</p>}
                  <p className="text-[11px] text-muted">Reported concentration — not confirmed rabies risk.</p>
                </div>
              </Popup>
            </Circle>
          ))}
        {center && radiusKm && (
          <>
            <Circle center={[center.lat, center.lng]} radius={radiusKm * 1000} pathOptions={{ color: "#818cf8", weight: 1.5, fillOpacity: 0.06, dashArray: "4 4" }} />
            <CircleMarker center={[center.lat, center.lng]} radius={6} pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#6366f1", fillOpacity: 1 }} />
          </>
        )}
        <ClusteredMarkers points={points} publicMode={publicMode} />
      </MapContainer>

      {/* control panel */}
      <div className="pointer-events-none absolute inset-0 z-[500] flex flex-col p-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
            <Layers /> Layers
          </Button>
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 w-auto text-xs" aria-label="Date range">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={0}>All time</option>
          </Select>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5 shadow-card">
            <Ruler className="ml-1.5 size-3.5 text-muted" />
            <Select value={radiusKm ?? ""} onChange={(e) => setRadiusKm(e.target.value ? Number(e.target.value) : null)} className="h-7 w-auto border-0 text-xs shadow-none" aria-label="Radius filter">
              <option value="">No radius</option>
              {RADII.map((r) => (
                <option key={r} value={r}>
                  Within {r} km
                </option>
              ))}
            </Select>
            <Button size="sm" variant={picking ? "primary" : "ghost"} className="h-7" onClick={() => setPicking((p) => !p)} title="Click the map to set the centre">
              <Crosshair /> {picking ? "Click map…" : "Set centre"}
            </Button>
            <Button size="icon-sm" variant="ghost" className="size-7" onClick={locate} aria-label="Use my location">
              <LocateFixed />
            </Button>
            {center && (
              <Button size="icon-sm" variant="ghost" className="size-7" onClick={() => { setCenter(null); setRadiusKm(null); }} aria-label="Clear radius">
                <X />
              </Button>
            )}
          </div>
        </div>

        {panelOpen && (
          <div className="pointer-events-auto mt-2 w-64 animate-fade-in rounded-xl border border-border bg-surface/95 p-3 shadow-pop backdrop-blur">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Layers</p>
            <ul className="space-y-1">
              {layers.map((l) => {
                const blocked = hidden.includes(l);
                return (
                  <li key={l}>
                    <label className={cn("flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-surface-2", blocked && "cursor-not-allowed opacity-50")}>
                      <input type="checkbox" className="accent-[var(--fg)]" checked={enabled.includes(l) && !blocked} disabled={blocked} onChange={() => toggleLayer(l)} />
                      <span className="size-2.5 rounded-full" style={{ background: LAYER_META[l].color }} />
                      <span className="flex-1 text-fg-soft">{LAYER_META[l].label}</span>
                      <span className="text-xs tabular-nums text-muted">{blocked ? "—" : (counts[l] ?? 0)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {analysis && (
              <>
                <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Analysis</p>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-surface-2">
                  <input type="checkbox" className="accent-[var(--fg)]" checked={showClusters} onChange={(e) => setShowClusters(e.target.checked)} />
                  <Radar className="size-3.5 text-muted" />
                  <span className="flex-1 text-fg-soft">Incident clusters</span>
                  <span className="text-xs tabular-nums text-muted">{showClusters ? (clusters?.totals.clusters ?? "…") : ""}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-surface-2">
                  <input type="checkbox" className="accent-[var(--fg)]" checked={showRisk} onChange={(e) => setShowRisk(e.target.checked)} />
                  <span className="size-2.5 rounded-sm bg-gradient-to-r from-sky-400 via-amber-400 to-red-500" />
                  <span className="flex-1 text-fg-soft">Activity grid (≈1 km)</span>
                </label>
                <p className="mt-2 text-[10px] leading-snug text-muted">Clusters and grid show concentrations of reported incidents, not confirmed rabies risk.</p>
              </>
            )}
            {center && radiusKm && (
              <div className="mt-3 rounded-lg border border-border bg-surface-2 p-2 text-xs">
                <p className="font-medium text-fg">{points.length} records within {radiusKm} km</p>
                <ul className="mt-1.5 space-y-1">
                  {points.slice(0, 4).map((p) => (
                    <li key={`${p.layer}:${p.id}`} className="flex items-center gap-1.5 text-muted">
                      <span className="size-1.5 rounded-full" style={{ background: LAYER_META[p.layer].color }} />
                      <span className="flex-1 truncate">{String(p.props.clinicName ?? p.props.organizationName ?? p.props.petName ?? p.props.tagOrEarMark ?? LAYER_META[p.layer].label)}</span>
                      <span className="tabular-nums">{(p.props.distanceKm as number).toFixed(2)} km</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="pointer-events-none mt-auto self-center rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted shadow-card">Loading map data…</div>
        )}
        {picking && (
          <div className="pointer-events-none mt-auto self-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-fg shadow-card">Click anywhere on the map to set the search centre</div>
        )}
      </div>
    </div>
  );
}
