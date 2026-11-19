"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useMunicipalityOptions } from "@/lib/places";
import { RegisterStrayDialog, StrayInspector, strayColumns, strayFacets, type StrayRow } from "@/components/entities/strays";
import { DataTable } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/primitives";
import { can, useSession } from "@/lib/client/session";

export default function StraysPage() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const rescue = can(session, "RESCUE_ORG");
  const municipalities = useMunicipalityOptions();
  const facets = useMemo(() => strayFacets(municipalities), [municipalities]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Community strays"
        description="Registered community animals with sterilisation and vaccination status from CNVR records."
        actions={rescue && <Button variant="primary" onClick={() => setOpen(true)}><Plus /> Register stray</Button>}
      />
      <DataTable<StrayRow>
        endpoint="/strays"
        columns={strayColumns}
        getRowId={(r) => r.id}
        facets={facets}
        defaultSort={{ id: "createdAt", desc: true }}
        searchPlaceholder="Tag, colour, landmark or description…"
        exportEntity={can(session, "WARD_OFFICER", "RESCUE_ORG") ? "strays" : undefined}
        inspector={StrayInspector}
        inspectorTitle={(r) => r.tagOrEarMark ?? "Unmarked stray"}
        inspectorDescription={(r) => r.address ?? undefined}
        refreshKey={refreshKey}
        csvName="strays"
      />
      {rescue && <RegisterStrayDialog open={open} onOpenChange={setOpen} onCreated={() => setRefreshKey((k) => k + 1)} />}
    </div>
  );
}
