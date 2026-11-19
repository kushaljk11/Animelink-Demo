import { MapPin, PawPrint } from "lucide-react";
import Link from "next/link";
import { Avatar, Card, EmptyState } from "@/components/ui/primitives";
import { serverApi } from "@/lib/server-api";
import { formatDate, timeAgo, titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lost pets" };

type LostRow = {
  id: string;
  lastSeenDate: string;
  description: string | null;
  area: { municipality: string | null; wardNumber: number | null };
  pet: { name: string; species: string; breed: string | null; color: string | null; gender: string; photoUrl: string | null; profilePath: string };
};

/** Public list of active lost pets from GET /api/lost-reports — no owner identity or exact location. */
export default async function LostPetsPage() {
  const r = await serverApi<{ data: LostRow[] }>("/lost-reports?limit=60&sort=lastSeenDate&order=desc");
  const reports = r.ok ? r.data.data : [];
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Lost pets</h1>
      <p className="mt-1 text-sm text-muted">Seen one of these pets? Open its profile to contact the owner and share where you saw it. You can also scan the QR tag on its collar.</p>
      {!r.ok ? (
        <EmptyState icon={<PawPrint />} title="Lost-pet list is unavailable" description="The API could not be reached. Try again shortly." />
      ) : reports.length === 0 ? (
        <EmptyState icon={<PawPrint />} title="No pets are reported lost right now" />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((rep) => (
            <Link key={rep.id} href={rep.pet.profilePath} className="group">
              <Card className="flex h-full gap-4 p-4 transition group-hover:border-border-strong">
                <Avatar name={rep.pet.name} src={rep.pet.photoUrl} className="size-20 rounded-xl" />
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-fg">{rep.pet.name}</p>
                  <p className="text-xs text-muted">{[titleCase(rep.pet.species), rep.pet.breed, rep.pet.color, titleCase(rep.pet.gender)].filter(Boolean).join(" · ")}</p>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <MapPin className="size-3" /> {[rep.area.wardNumber ? `Ward ${rep.area.wardNumber}` : null, rep.area.municipality?.replace(" Metropolitan City", "")].filter(Boolean).join(", ") || "Kathmandu Valley"}
                  </p>
                  <p className="text-xs font-medium text-danger">Missing since {formatDate(rep.lastSeenDate)} ({timeAgo(rep.lastSeenDate)})</p>
                  {rep.description && <p className="line-clamp-2 text-xs text-fg-soft">{rep.description}</p>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
