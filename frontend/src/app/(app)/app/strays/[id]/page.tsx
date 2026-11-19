import { redirect } from "next/navigation";

/** Deep links (notifications, search, map popups) open the record inspector on the list page. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/strays?open=${encodeURIComponent(id)}`);
}
