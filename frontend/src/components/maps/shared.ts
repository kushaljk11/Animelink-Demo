import L from "leaflet";

export const VALLEY_CENTER: [number, number] = [27.6915, 85.3305];
export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type LayerKey = "incidents" | "strays" | "cnvr" | "clinics" | "shelters" | "lost";

export const LAYER_META: Record<LayerKey, { label: string; color: string; glyph: string }> = {
  incidents: { label: "Bite incidents", color: "var(--info)", glyph: "" },
  strays: { label: "Community strays", color: "var(--warning)", glyph: "" },
  cnvr: { label: "CNVR releases", color: "var(--violet)", glyph: "" },
  clinics: { label: "Vet clinics", color: "var(--chart-2)", glyph: "+" },
  shelters: { label: "Shelters / rescue", color: "var(--chart-3)", glyph: "⌂" },
  lost: { label: "Lost pets (approx.)", color: "var(--danger)", glyph: "?" },
};

/** Round dot marker with glow; `pulse` adds an attention ring (suspected rabies, lost pets). */
export function dotIcon(color: string, opts: { size?: number; glyph?: string; pulse?: boolean } = {}) {
  const size = opts.size ?? 14;
  const glyph = opts.glyph
    ? `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:700 ${Math.round(size * 0.62)}px/1 system-ui">${opts.glyph}</span>`
    : "";
  const pulse = opts.pulse
    ? `<span style="position:absolute;inset:-6px;border-radius:999px;border:2px solid ${color};opacity:.55;animation:pulse-dot 1.8s ease-out infinite;color:${color}"></span>`
    : "";
  return L.divIcon({
    className: "rtn-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<span style="position:relative;display:block;width:${size}px;height:${size}px;border-radius:999px;background:${color};border:2px solid var(--surface);box-shadow:0 0 0 1px color-mix(in oklab, ${color} 60%, transparent),0 0 12px color-mix(in oklab, ${color} 55%, transparent)">${pulse}${glyph}</span>`,
  });
}

export function clusterIcon(count: number) {
  const size = count < 10 ? 30 : count < 50 ? 38 : 46;
  return L.divIcon({
    className: "rtn-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="display:flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;border-radius:999px;background:color-mix(in oklab, var(--surface) 82%, transparent);border:2px solid var(--fg-soft);box-shadow:0 0 0 4px color-mix(in oklab, var(--fg-soft) 18%, transparent),var(--shadow-pop);color:var(--fg);font:600 12px/1 var(--font-sans);backdrop-filter:blur(4px)">${count}</span>`,
  });
}

export const LEVEL_COLOR: Record<string, string> = { HIGH: "#ef4444", MODERATE: "#f59e0b", LOW: "#38bdf8" };
