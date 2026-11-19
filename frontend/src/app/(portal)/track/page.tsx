import { TrackView } from "@/components/portal/TrackView";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Track a report" };

export default async function TrackPage() {
  const { t } = await getT();
  return (
    <div className="px-4 py-8 sm:py-12">
      <div className="mx-auto mb-6 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{t("track.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("track.lead")}</p>
      </div>
      <TrackView />
    </div>
  );
}
