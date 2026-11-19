"use client";

import { useMunicipalityOptions } from "@/lib/places";
import { useMemo } from "react";
import { ClinicInspector, directoryColumns, directoryFacets, directoryName, type DirectoryRow } from "@/components/entities/admin";
import { DataTable } from "@/components/tables/DataTable";
import { PageHeader } from "@/components/ui/primitives";
import { can, useSession } from "@/lib/client/session";

export default function ClinicsPage() {
  const session = useSession();
  const privileged = can(session, "WARD_OFFICER");
  const columns = useMemo(() => directoryColumns("clinics", privileged), [privileged]);
  const municipalities = useMunicipalityOptions();
  const facets = useMemo(() => directoryFacets(privileged, municipalities), [privileged, municipalities]);
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Veterinary clinics"
        description={session.role === "ADMIN" ? "Review registrations and verify clinics. Only verified clinics can record vaccinations." : privileged ? "All registered clinics and their verification status." : "Verified veterinary clinics."}
      />
      <DataTable<DirectoryRow>
        endpoint="/clinics"
        columns={columns}
        getRowId={(r) => r.id}
        facets={facets}
        defaultSort={{ id: "clinicName", desc: false }}
        searchPlaceholder="Clinic name, address or registration…"
        exportEntity={privileged ? "clinics" : undefined}
        inspector={ClinicInspector}
        inspectorTitle={directoryName}
        inspectorDescription={(r) => r.registrationNumber}
        csvName="clinics"
      />
    </div>
  );
}
