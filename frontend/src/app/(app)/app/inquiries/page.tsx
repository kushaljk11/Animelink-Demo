"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, CheckCircle2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DateCell } from "@/components/entities/common";
import { DataTable, type Facet, type InspectorProps } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/button";
import { DualDate } from "@/components/ui/dual-date";
import { DetailRow, PageHeader } from "@/components/ui/primitives";
import { StatusPill } from "@/components/ui/status-pill";
import { api, errorMessage } from "@/lib/api";
import { titleCase } from "@/lib/utils";

type Inquiry = { id: string; name: string; phone: string; email: string | null; topic: string; message: string; phoneVerified: boolean; status: "NEW" | "RESOLVED"; createdAt: string };

const columns: ColumnDef<Inquiry, unknown>[] = [
  { accessorKey: "createdAt", header: "Received", cell: ({ row }) => <DateCell value={row.original.createdAt} />, meta: { label: "Received" } },
  {
    id: "from",
    header: "From",
    cell: ({ row }) => (
      <div className="text-sm">
        <p className="font-medium text-fg">{row.original.name}</p>
        <p className="flex items-center gap-1 text-xs text-muted">
          {row.original.phone} {row.original.phoneVerified && <BadgeCheck className="size-3.5 text-success" aria-label="Verified by SMS" />}
        </p>
      </div>
    ),
    meta: { label: "From", exportValue: (r) => `${r.name} ${r.phone}` },
  },
  { accessorKey: "topic", header: "Topic", cell: ({ row }) => <span className="text-sm">{titleCase(row.original.topic)}</span>, meta: { label: "Topic" } },
  { accessorKey: "message", header: "Message", cell: ({ row }) => <p className="line-clamp-2 max-w-md text-sm text-fg-soft">{row.original.message}</p>, meta: { label: "Message" } },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusPill status={row.original.status === "NEW" ? "PENDING" : "RESOLVED"} label={row.original.status === "NEW" ? "New" : "Resolved"} />, meta: { label: "Status" } },
];

const facets: Facet[] = [{ key: "status", label: "Status", single: true, options: [{ value: "NEW", label: "New" }, { value: "RESOLVED", label: "Resolved" }] }];

function InquiryInspector({ row, refresh, close }: InspectorProps<Inquiry>) {
  const [busy, setBusy] = useState(false);
  const set = async (status: Inquiry["status"]) => {
    setBusy(true);
    try {
      await api(`/inquiries/${row.id}`, { method: "PATCH", body: { status } });
      toast.success(status === "RESOLVED" ? "Marked resolved" : "Reopened");
      refresh();
      close();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <p className="whitespace-pre-line rounded-lg border border-border bg-surface-2 p-3 text-sm leading-relaxed text-fg-soft">{row.message}</p>
      <dl className="divide-y divide-border">
        <DetailRow label="Name">{row.name}</DetailRow>
        <DetailRow label="Phone"><a className="text-accent" href={`tel:${row.phone}`}>{row.phone}</a>{row.phoneVerified ? " · verified by SMS" : ""}</DetailRow>
        {row.email && <DetailRow label="Email"><a className="text-accent" href={`mailto:${row.email}`}>{row.email}</a></DetailRow>}
        <DetailRow label="Topic">{titleCase(row.topic)}</DetailRow>
        <DetailRow label="Received"><DualDate value={row.createdAt} time stacked /></DetailRow>
      </dl>
      <div className="flex justify-end">
        {row.status === "NEW" ? (
          <Button variant="success" size="sm" onClick={() => void set("RESOLVED")} loading={busy}><CheckCircle2 /> Mark resolved</Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => void set("NEW")} loading={busy}><RotateCcw /> Reopen</Button>
        )}
      </div>
    </div>
  );
}

export default function InquiriesPage() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <PageHeader title="Inquiries" description="Messages from the public contact form. Phone numbers are verified by SMS before a message is accepted." />
      <DataTable<Inquiry>
        endpoint="/inquiries"
        columns={columns}
        getRowId={(r) => r.id}
        facets={facets}
        inspector={InquiryInspector}
        inspectorTitle={(r) => `${titleCase(r.topic)} · ${r.name}`}
        csvName="inquiries"
        emptyDescription="No inquiries yet."
      />
    </div>
  );
}
