"use client";

import { AuditInspector, auditColumns, auditFacets, type AuditRow } from "@/components/entities/admin";
import { DataTable } from "@/components/tables/DataTable";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { can, useSession } from "@/lib/client/session";

export default function AuditPage() {
  const session = useSession();
  if (!can(session, "WARD_OFFICER")) return <EmptyState title="Not available for your role" />;
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Audit log"
        description={session.role === "ADMIN" ? "Every vaccination verification, incident status change, CNVR update and administrative action." : "Incident, CNVR and export history."}
      />
      <DataTable<AuditRow>
        endpoint="/audit"
        columns={auditColumns}
        getRowId={(r) => r.id}
        facets={auditFacets}
        defaultSort={{ id: "createdAt", desc: true }}
        searchPlaceholder="Action, record id or actor…"
        inspector={AuditInspector}
        inspectorTitle={(r) => r.action}
        pageSize={50}
        csvName="audit"
      />
    </div>
  );
}
