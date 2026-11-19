"use client";

import { useMunicipalityOptions } from "@/lib/places";
import { useMemo } from "react";
import { directoryColumns, directoryFacets, directoryName, OrganizationInspector, type DirectoryRow } from "@/components/entities/admin";
import { DataTable } from "@/components/tables/DataTable";
import { PageHeader } from "@/components/ui/primitives";
import { can, useSession } from "@/lib/client/session";

export default function OrganizationsPage() {
  const session = useSession();
  const privileged = can(session, "WARD_OFFICER");
  const columns = useMemo(() => directoryColumns("organizations", privileged), [privileged]);
  const municipalities = useMunicipalityOptions();
  const facets = useMemo(() => [...directoryFacets(privileged, municipalities), { key: "hasShelter", label: "Type", single: true, options: [{ value: "true", label: "Shelter" }, { value: "false", label: "Field rescue" }] }], [privileged, municipalities]);
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <PageHeader title="Rescue organisations & shelters" description={session.role === "ADMIN" ? "Review and verify organisations. Only verified organisations can record CNVR activity." : "Verified rescue organisations and shelters."} />
      <DataTable<DirectoryRow>
        endpoint="/organizations"
        columns={columns}
        getRowId={(r) => r.id}
        facets={facets}
        defaultSort={{ id: "organizationName", desc: false }}
        searchPlaceholder="Organisation name or address…"
        exportEntity={privileged ? "organizations" : undefined}
        inspector={OrganizationInspector}
        inspectorTitle={directoryName}
        csvName="organizations"
      />
    </div>
  );
}
