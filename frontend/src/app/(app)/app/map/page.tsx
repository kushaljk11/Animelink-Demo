"use client";

import { useEffect, useState } from "react";
import { GeoMap, type LayerKey } from "@/components/maps/GeoMap";
import { PageHeader, Skeleton } from "@/components/ui/primitives";
import { can, useSession } from "@/lib/client/session";
import type { LatLng } from "@/lib/geo";

export default function MapPage() {
  const session = useSession();
  const [ready, setReady] = useState(false);
  const [focus, setFocus] = useState<LatLng | null>(null);
  const [showClusters, setShowClusters] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const f = sp.get("focus")?.split(",").map(Number);
    if (f && f.length === 2 && f.every(Number.isFinite)) setFocus({ lat: f[0]!, lng: f[1]! });
    setShowClusters(sp.get("layer") === "clusters");
    setReady(true);
  }, []);

  const monitoring = can(session, "WARD_OFFICER", "RESCUE_ORG");
  const layers: LayerKey[] = can(session, "WARD_OFFICER", "RESCUE_ORG", "VET_CLINIC")
    ? ["incidents", "strays", "cnvr", "clinics", "shelters", "lost"]
    : ["incidents", "clinics", "shelters", "lost"];
  const defaults: LayerKey[] = monitoring ? ["incidents", "clinics", "shelters"] : session.role === "VET_CLINIC" ? ["clinics", "strays", "lost"] : ["clinics", "shelters", "lost", "incidents"];

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        title={monitoring ? "Geospatial surveillance" : "Map"}
        description={
          monitoring
            ? "Incidents, strays and CNVR activity with DBSCAN cluster detection and a ~1 km activity grid. Use the radius filter for distance queries."
            : "Verified vets and shelters, lost pets (approximate areas) and your own reports."
        }
      />
      {ready ? (
        <GeoMap layers={layers} defaultLayers={defaults} analysis={monitoring || showClusters} focus={focus} className="min-h-[520px] flex-1" />
      ) : (
        <Skeleton className="min-h-[520px] flex-1 rounded-xl" />
      )}
    </div>
  );
}
