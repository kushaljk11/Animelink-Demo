"use client";

import { CnvrInspector, cnvrColumns, cnvrFacets, type CnvrRow } from "@/components/entities/strays";
import { DataTable } from "@/components/tables/DataTable";
import { PageHeader } from "@/components/ui/primitives";
import { can, useSession } from "@/lib/client/session";

export default function CnvrPage() {
  const session = useSession();
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <PageHeader title="CNVR records" description="Catch–Neuter–Vaccinate–Release activity. Record new activity from a stray's inspector on the Strays page." />
      <DataTable<CnvrRow>
        endpoint="/cnvr"
        columns={cnvrColumns}
        getRowId={(r) => r.id}
        facets={cnvrFacets}
        defaultSort={{ id: "createdAt", desc: true }}
        searchPlaceholder="Tag, vaccine, organisation or notes…"
        exportEntity={can(session, "WARD_OFFICER", "RESCUE_ORG") ? "cnvr" : undefined}
        inspector={CnvrInspector}
        inspectorTitle={(r) => `CNVR · ${r.stray.tagOrEarMark ?? "Unmarked"}`}
        inspectorDescription={(r) => r.organization.organizationName}
        csvName="cnvr"
      />
    </div>
  );
}
