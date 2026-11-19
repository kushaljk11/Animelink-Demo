"use client";

import { useMemo } from "react";
import { VaccinationInspector, vaccinationBulkActions, vaccinationColumns, vaccinationFacets, type VaccinationRow } from "@/components/entities/vaccinations";
import { DataTable } from "@/components/tables/DataTable";
import { PageHeader } from "@/components/ui/primitives";
import { useSession } from "@/lib/client/session";

export default function VaccinationsPage() {
  const session = useSession();
  const bulk = useMemo(() => vaccinationBulkActions(session), [session]);
  const vet = session.role === "VET_CLINIC";

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <PageHeader
        title={vet ? "Vaccination records" : "Vaccinations"}
        description={
          vet
            ? `Records at your clinic and owner submissions awaiting verification${session.clinicStatus !== "VERIFIED" ? " — your clinic must be verified before you can verify records" : ""}.`
            : session.role === "PET_OWNER"
              ? "Vaccination history for your pets. Only records verified by a clinic count toward status."
              : "Verified pet vaccinations across the platform."
        }
      />
      <DataTable<VaccinationRow>
        endpoint="/vaccinations"
        columns={vaccinationColumns}
        getRowId={(r) => r.id}
        facets={vaccinationFacets}
        extraParams={vet ? { mine: "true" } : undefined}
        defaultSort={{ id: "administeredDate", desc: true }}
        searchPlaceholder="Pet, vaccine, batch or clinic…"
        bulkActions={bulk}
        exportEntity={vet || session.role === "WARD_OFFICER" || session.role === "ADMIN" ? "vaccinations" : undefined}
        inspector={VaccinationInspector}
        inspectorTitle={(r) => `${r.vaccineName} · ${r.pet.name}`}
        inspectorDescription={(r) => `Batch ${r.batchNumber}`}
        csvName="vaccinations"
      />
    </div>
  );
}
