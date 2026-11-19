"use client";

import { Bot, Download, FileText, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, Skeleton } from "@/components/ui/primitives";
import { apiUrl, qs } from "@/lib/api";
import { can, useSession } from "@/lib/client/session";
import { type Role } from "@/lib/constants";
import { useMunicipalityOptions } from "@/lib/places";

const ENTITIES: { value: string; label: string; roles: Role[] }[] = [
  { value: "incidents", label: "Bite / suspected-rabies incidents", roles: ["WARD_OFFICER"] },
  { value: "vaccinations", label: "Vaccination records", roles: ["WARD_OFFICER", "VET_CLINIC"] },
  { value: "cnvr", label: "CNVR records", roles: ["WARD_OFFICER", "RESCUE_ORG"] },
  { value: "strays", label: "Community strays", roles: ["WARD_OFFICER", "RESCUE_ORG"] },
  { value: "clinics", label: "Veterinary clinics", roles: ["WARD_OFFICER"] },
  { value: "organizations", label: "Rescue organisations", roles: ["WARD_OFFICER"] },
  { value: "pets", label: "Registered pets (no owner identity)", roles: [] },
];

type Ward = { municipality: string; wardNumber: number | null; incidents: number; suspectedRabies: number; highSeverity: number; open: number; strays: number; sterilizedStrays: number; cnvrProcedures: number };
type Metrics = {
  breedFinder: { totalPredictions: number; answeredByOwner: number; userConfirmationRatePct: number | null; averageConfidence: number | null; calibration: { range: string; count: number; accuracyPct: number | null }[]; topCorrections: { pair: string; count: number }[] };
  chatbot: { totalQuestions: number; safetyEscalations: number; safetyEscalationRatePct: number | null; fallbackRatePct: number | null; helpfulRatePct: number | null; ratedCount: number; responseMs: { avg: number | null; p95: number | null }; byIntent: { intent: string; count: number }[] };
};

function WardTable() {
  const { data } = useSWR<{ wards: Ward[]; municipality: string | null }>("/stats/wards?days=30");
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Ward summary · last 30 days" description={`Counts only — ward animal populations are unknown, so no coverage percentages are shown.${data?.municipality ? ` Scope: ${data.municipality}` : ""}`} />
      <div className="scroll-thin max-h-[420px] overflow-auto">
        {!data ? (
          <div className="p-5"><Skeleton className="h-40 w-full" /></div>
        ) : data.wards.length === 0 ? (
          <EmptyState title="No ward data" />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wider text-muted">
              <tr>{["Area", "Incidents", "Suspected", "High sev.", "Open", "Strays", "Sterilised", "CNVR"].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold first:pl-5">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.wards.map((w) => (
                <tr key={`${w.municipality}-${w.wardNumber}`} className="tabular-nums">
                  <td className="px-3 py-2 pl-5 text-fg">{w.municipality.replace(" Metropolitan City", "").replace(" Municipality", "")}{w.wardNumber ? ` · Ward ${w.wardNumber}` : ""}</td>
                  <td className="px-3 py-2 font-medium text-fg">{w.incidents}</td>
                  <td className={`px-3 py-2 ${w.suspectedRabies ? "text-danger" : "text-muted"}`}>{w.suspectedRabies}</td>
                  <td className="px-3 py-2 text-fg-soft">{w.highSeverity}</td>
                  <td className="px-3 py-2 text-fg-soft">{w.open}</td>
                  <td className="px-3 py-2 text-fg-soft">{w.strays}</td>
                  <td className="px-3 py-2 text-fg-soft">{w.sterilizedStrays}</td>
                  <td className="px-3 py-2 text-fg-soft">{w.cnvrProcedures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-fg">{value ?? "—"}</p>
    </div>
  );
}

function AiMetrics() {
  const { data } = useSWR<Metrics>("/ai/metrics");
  return (
    <Card>
      <CardHeader title="AI evaluation" description="Section T.5 metrics computed from logged predictions and chatbot answers" />
      {!data ? (
        <div className="p-5"><Skeleton className="h-40 w-full" /></div>
      ) : (
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium text-fg"><Sparkles className="size-4 text-accent" /> Breed finder</p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Predictions" value={data.breedFinder.totalPredictions} />
              <Stat label="Owner confirmation" value={data.breedFinder.userConfirmationRatePct !== null ? `${data.breedFinder.userConfirmationRatePct}%` : null} />
              <Stat label="Avg confidence" value={data.breedFinder.averageConfidence !== null ? `${Math.round(data.breedFinder.averageConfidence * 100)}%` : null} />
              <Stat label="Answered" value={data.breedFinder.answeredByOwner} />
            </div>
            <div className="space-y-1 text-xs">
              <p className="text-muted">Calibration (accuracy by confidence band)</p>
              {data.breedFinder.calibration.map((c) => (
                <div key={c.range} className="flex items-center gap-2">
                  <span className="w-20 tabular-nums text-muted">{c.range}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent" style={{ width: `${c.accuracyPct ?? 0}%` }} /></div>
                  <span className="w-16 text-right tabular-nums text-fg-soft">{c.accuracyPct !== null ? `${c.accuracyPct}%` : "—"} <span className="text-muted">({c.count})</span></span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium text-fg"><Bot className="size-4 text-accent" /> Chatbot</p>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Questions" value={data.chatbot.totalQuestions} />
              <Stat label="Safety escalations" value={`${data.chatbot.safetyEscalations} (${data.chatbot.safetyEscalationRatePct ?? 0}%)`} />
              <Stat label="Helpful (rated)" value={data.chatbot.helpfulRatePct !== null ? `${data.chatbot.helpfulRatePct}% of ${data.chatbot.ratedCount}` : null} />
              <Stat label="Response p95" value={data.chatbot.responseMs.p95 !== null ? `${data.chatbot.responseMs.p95} ms` : null} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.chatbot.byIntent.slice(0, 10).map((i) => (
                <span key={i.intent} className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-fg-soft">{i.intent} <span className="text-muted">{i.count}</span></span>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function ReportsPage() {
  const session = useSession();
  const allowed = ENTITIES.filter((e) => session.role === "ADMIN" || e.roles.includes(session.role));
  const [entity, setEntity] = useState(allowed[0]?.value ?? "");
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [municipality, setMunicipality] = useState("");
  const municipalities = useMunicipalityOptions();
  const [ward, setWard] = useState("");

  const download = (format: "csv" | "pdf") => {
    if (!entity) return;
    const url = apiUrl(`/reports/export${qs({ entity, format, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined, municipality: municipality || undefined, wardNumber: ward || undefined })}`);
    window.location.href = url;
    toast.success(`Preparing ${format.toUpperCase()} export…`);
  };

  if (!allowed.length) return <EmptyState title="No exports available for your role" />;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <PageHeader title="Reports & export" description="Generate filtered CSV or PDF reports. Every export is recorded in the audit log." />
      <Card>
        <CardHeader title="Export data" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Dataset" className="lg:col-span-2">
            <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
              {allowed.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Municipality">
            <Select value={municipality} onChange={(e) => setMunicipality(e.target.value)}>
              <option value="">All</option>
              {municipalities.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Ward"><Input type="number" min={1} max={35} value={ward} onChange={(e) => setWard(e.target.value)} placeholder="Any" /></Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="secondary" onClick={() => download("csv")}><Download /> CSV</Button>
          <Button variant="primary" onClick={() => download("pdf")}><FileText /> PDF report</Button>
        </div>
      </Card>
      {can(session, "WARD_OFFICER") && (
        <>
          <WardTable />
          <AiMetrics />
        </>
      )}
    </div>
  );
}
