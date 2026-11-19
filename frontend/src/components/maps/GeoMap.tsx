"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { GeoMapProps } from "./GeoMapInner";

export type { GeoMapProps } from "./GeoMapInner";
export type { LayerKey } from "./shared";

// Leaflet touches `window` at import time — load it client-side only.
const Inner = dynamic(() => import("./GeoMapInner"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-xl" />,
});

/**
 * Interactive surveillance map: clustered markers per layer, popups with
 * "View in table" deep links, haversine radius filter, and (for monitoring
 * roles) DBSCAN incident clusters + ~1 km activity grid overlays.
 */
export function GeoMap(props: GeoMapProps) {
  return (
    <div className={cn("h-[560px]", props.className)}>
      <Inner {...props} className="h-full" />
    </div>
  );
}
