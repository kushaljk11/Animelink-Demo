"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import { TILE_ATTRIBUTION, TILE_URL, VALLEY_CENTER } from "@/components/maps/shared";

export type Milestone = { lat: number; lng: number; animalType: string; area: string | null; resolvedAt: string; daysToResolve: number };

/** Read-only: no dragging-to-pan on touch (keeps page scroll), no zoom on scroll; markers are ~1 km blurred. */
export default function MilestoneMapInner({ points, label }: { points: Milestone[]; label: (m: Milestone) => string }) {
  return (
    <MapContainer
      center={VALLEY_CENTER}
      zoom={12}
      minZoom={10}
      maxZoom={14}
      scrollWheelZoom={false}
      dragging={typeof window !== "undefined" && !("ontouchstart" in window)}
      className="h-full w-full"
      attributionControl
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} className="rtn-tiles" />
      {points.map((m, i) => (
        <CircleMarker
          key={`${m.lat},${m.lng},${i}`}
          center={[m.lat, m.lng]}
          radius={9}
          pathOptions={{ color: "var(--success)", weight: 2, fillColor: "var(--success)", fillOpacity: 0.35 }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            {label(m)}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
