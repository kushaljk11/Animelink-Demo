"use client";

import "leaflet/dist/leaflet.css";
import type L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLng } from "@/lib/geo";
import { dotIcon, TILE_ATTRIBUTION, TILE_URL, VALLEY_CENTER } from "./shared";

function ClickToPlace({ onChange }: { onChange: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function Follow({ value }: { value: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], Math.max(map.getZoom(), 15), { animate: true });
  }, [map, value]);
  return null;
}

export default function LocationPickerInner({ value, onChange }: { value: LatLng | null; onChange: (p: LatLng) => void }) {
  return (
    <MapContainer center={value ? [value.lat, value.lng] : VALLEY_CENTER} zoom={value ? 15 : 12} className="h-full w-full cursor-crosshair">
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} className="rtn-tiles" maxZoom={19} />
      <ClickToPlace onChange={onChange} />
      <Follow value={value} />
      {value && (
        <Marker
          position={[value.lat, value.lng]}
          icon={dotIcon("var(--danger)", { size: 20, pulse: true })}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              onChange({ lat: ll.lat, lng: ll.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}
