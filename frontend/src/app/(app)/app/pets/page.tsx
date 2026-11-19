"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AddPetDialog, petColumns, petFacets, type PetRow } from "@/components/entities/pets";
import { DataTable } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/primitives";
import { useSession } from "@/lib/client/session";

export default function PetsPage() {
  const session = useSession();
  const router = useRouter();
  const owner = session.role === "PET_OWNER";
  const [adding, setAdding] = useState(false);
  const columns = useMemo(() => petColumns(!owner), [owner]);

  useEffect(() => {
    if (owner && new URLSearchParams(window.location.search).get("new")) setAdding(true);
  }, [owner]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <PageHeader
        title={owner ? "My pets" : session.role === "VET_CLINIC" ? "Patients" : "Registered pets"}
        description={owner ? "Digital profiles, QR tags, vaccination status and certificates." : "Search registered pets by name, breed, owner name or phone, or QR token."}
        actions={owner && <Button variant="primary" onClick={() => setAdding(true)}><Plus /> Register pet</Button>}
      />
      <DataTable<PetRow>
        endpoint="/pets"
        columns={columns}
        getRowId={(r) => r.id}
        facets={petFacets}
        defaultSort={{ id: "createdAt", desc: true }}
        searchPlaceholder={owner ? "Search your pets…" : "Name, breed, owner or phone…"}
        onRowClick={(r) => router.push(`/app/pets/${r.id}`)}
        exportEntity={session.role === "ADMIN" ? "pets" : undefined}
        csvName="pets"
        emptyTitle={owner ? "No pets registered yet" : "No pets found"}
        emptyDescription={owner ? "Register your first pet to get a QR tag and booster reminders." : undefined}
      />
      {owner && <AddPetDialog open={adding} onOpenChange={setAdding} onCreated={(id) => router.push(`/app/pets/${id}`)} />}
    </div>
  );
}
