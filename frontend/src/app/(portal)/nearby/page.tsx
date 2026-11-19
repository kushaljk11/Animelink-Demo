import { GeoMap } from "@/components/maps/GeoMap";

export const metadata = { title: "Nearby vets & shelters" };

export default function NearbyPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Nearby vets & shelters</h1>
        <p className="mt-1 text-sm text-muted">Tap the locate button or <strong>Set centre</strong> and click the map, then choose a radius. Distances are straight-line (great-circle) estimates.</p>
      </div>
      <GeoMap layers={["clinics", "shelters", "lost"]} defaultLayers={["clinics", "shelters"]} publicMode defaultRadiusKm={5} className="h-[calc(100dvh-16rem)] min-h-[480px]" />
    </div>
  );
}
