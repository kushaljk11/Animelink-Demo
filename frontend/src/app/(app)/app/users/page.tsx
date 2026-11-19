"use client";

import { UserInspector, userColumns, userFacets, type UserRow } from "@/components/entities/admin";
import { DataTable } from "@/components/tables/DataTable";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { useSession } from "@/lib/client/session";
import { ROLE_LABEL } from "@/lib/constants";

export default function UsersPage() {
  const session = useSession();
  if (session.role !== "ADMIN") return <EmptyState title="Administrators only" description="User management is restricted to platform administrators." />;
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <PageHeader title="Users" description="Manage roles, municipalities and account access. Deactivation signs the user out everywhere." />
      <DataTable<UserRow>
        endpoint="/users"
        columns={userColumns}
        getRowId={(r) => r.id}
        facets={userFacets}
        defaultSort={{ id: "createdAt", desc: true }}
        searchPlaceholder="Name, email or phone…"
        inspector={UserInspector}
        inspectorTitle={(r) => r.fullName}
        inspectorDescription={(r) => ROLE_LABEL[r.role]}
        csvName="users"
      />
    </div>
  );
}
