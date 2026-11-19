import { SubmitWizard } from "@/components/portal/SubmitWizard";
import { getServerSession } from "@/lib/server-api";

export const metadata = { title: "Report an incident" };

/**
 * Public intake wizard for animal-bite and suspected-rabies reports (Sections K.5, N.4).
 * Works without an account; signed-in users are linked to the report automatically.
 */
export default async function SubmitPage() {
  const user = await getServerSession();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <div className="mx-auto mb-8 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Report an animal bite or suspected rabies</h1>
        <p className="mt-1 text-sm text-muted">Your report goes to the ward office and is added to the surveillance map. You&apos;ll get a tracking code to follow its progress.</p>
      </div>
      <SubmitWizard signedIn={!!user} userName={user?.fullName} />
    </div>
  );
}
