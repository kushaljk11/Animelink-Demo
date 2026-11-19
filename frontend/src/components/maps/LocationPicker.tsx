"use client";

import { Loader2, LocateFixed, MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import type { LatLng } from "@/lib/geo";
import { currentPosition, reverseGeocode, type Place } from "@/lib/places";
import { cn } from "@/lib/utils";

const Inner = dynamic(() => import("./LocationPickerInner"), { ssr: false, loading: () => <Skeleton className="h-full w-full" /> });

/**
 * Click / drag to pin a location, or use the device GPS (accuracy reported back).
 * With `onPlace`, every user-made pin is looked up (municipality, ward, landmark) so forms can fill themselves in.
 */
export function LocationPicker({
  value,
  onChange,
  onPlace,
  className,
  invalid,
}: {
  value: LatLng | null;
  onChange: (p: LatLng, accuracyM?: number) => void;
  onPlace?: (place: Place) => void;
  className?: string;
  invalid?: boolean;
}) {
  const [locating, setLocating] = useState(false);
  const [place, setPlace] = useState<{ state: "loading" | "done"; label: string; warn?: boolean } | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced so dragging the pin doesn't fire a lookup per pixel; stale answers are dropped.
  const resolve = (p: LatLng) => {
    if (!onPlace) return;
    if (timer.current) clearTimeout(timer.current);
    const id = ++seq.current;
    setPlace({ state: "loading", label: "Finding the area…" });
    timer.current = setTimeout(async () => {
      try {
        const r = await reverseGeocode(p);
        if (id !== seq.current) return;
        if (!r.inNepal) return setPlace({ state: "done", label: "This pin is outside Nepal. Please check the location.", warn: true });
        if (r.source === "none") return setPlace({ state: "done", label: "Couldn't detect the area. Please fill it in below.", warn: true });
        setPlace({ state: "done", label: r.source === "records" ? `${r.label} (estimated offline)` : r.label });
        onPlace(r);
      } catch {
        if (id === seq.current) setPlace({ state: "done", label: "Couldn't detect the area. Please fill it in below.", warn: true });
      }
    }, 500);
  };

  const pick = (p: LatLng, accuracyM?: number) => {
    onChange(p, accuracyM);
    resolve(p);
  };

  const locate = async () => {
    setLocating(true);
    try {
      const { p, accuracy } = await currentPosition();
      pick(p, accuracy);
      toast.success(`Location captured (±${Math.round(accuracy)} m)`);
    } catch (err) {
      toast.error(`${err instanceof Error ? err.message : "Could not get your location"}. Tap the map to pin it instead.`);
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className={cn("relative isolate h-72 overflow-hidden rounded-xl border bg-surface-2", invalid ? "border-danger/60" : "border-border")}>
        <Inner value={value} onChange={(p) => pick(p)} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-muted">
          <MapPin className="size-3.5 shrink-0" />
          {value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}. Drag the pin to adjust` : "Tap the map to drop a pin"}
        </span>
        <Button type="button" size="sm" variant="secondary" onClick={() => void locate()} loading={locating}>
          <LocateFixed /> Use my location
        </Button>
      </div>
      {place && (
        <p className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs", place.warn ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-surface-2 text-fg-soft")}>
          {place.state === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <MapPin className="size-3.5 text-accent" />}
          {place.label}
        </p>
      )}
    </div>
  );
}
