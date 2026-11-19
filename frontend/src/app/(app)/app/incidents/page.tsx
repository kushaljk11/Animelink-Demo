"use client";

import { Map as MapIcon, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { IncidentInspector, incidentAssignedFacet, incidentBulkActions, incidentColumns, incidentFacets, type IncidentRow } from "@/components/entities/incidents";
import { shortId } from "@/components/entities/common";
import { DataTable } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/primitives";
import { can, useSession } from "@/lib/client/session";
import { titleCase } from "@/lib/utils";

export default function IncidentsPage() {
  const session = useSession();
  const officer = can(session, "WARD_OFFICER");
  const bulk = useMemo(() => incidentBulkActions(session), [session]);
  const handles = officer || session.role === "RESCUE_ORG";
  const facets = useMemo(() => (handles ? [incidentAssignedFacet, ...incidentFacets] : incidentFacets), [handles]);
  const mine = session.role === "PET_OWNER" || session.role === "VET_CLINIC";

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <PageHeader
        title={mine ? "My incident reports" : "Bite & suspected-rabies incidents"}
        description={
          officer
            ? `Review, verify and resolve reports${session.municipality && session.role === "WARD_OFFICER" ? ` in ${session.municipality}` : " across all municipalities"}.`
            : session.role === "RESCUE_ORG"
              ? "Reports near you that need a response. Take a case to see the reporter's contact details and update its status."
              : "Reports you have submitted and their current status."
        }
        actions={
          <>
            <Button asChild variant="secondary"><Link href="/app/map"><MapIcon /> Map view</Link></Button>
            <Button asChild variant="primary"><Link href="/submit"><Plus /> New report</Link></Button>
          </>
        }
      />
      <DataTable<IncidentRow>
        endpoint="/incidents"
        columns={incidentColumns}
        getRowId={(r) => r.id}
        facets={facets}
        defaultSort={{ id: "incidentDate", desc: true }}
        searchPlaceholder="Search description, location or code…"
        bulkActions={bulk}
        exportEntity={officer ? "incidents" : undefined}
        inspector={IncidentInspector}
        inspectorTitle={(r) => `${titleCase(r.animalType)} bite · #${shortId(r.id)}`}
        inspectorDescription={(r) => r.address ?? undefined}
        defaultHidden={["wardNumber", "createdAt", ...(mine ? ["reporter"] : []), ...(handles ? [] : ["handledBy"])]}
        csvName="incidents"
        emptyDescription={mine ? "You haven't reported any incidents." : "No incidents match."}
      />
    </div>
  );
}
