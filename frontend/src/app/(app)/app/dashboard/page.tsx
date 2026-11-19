"use client";

import { ArrowRight, Download, Map as MapIcon, PawPrint, Plus, Search, ShieldAlert, Syringe } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ActivityChart, DistributionChart, RankingChart, type SeriesDef, type SeriesRow, type Slice } from "@/components/dashboard/AnalyticsCharts";
import { MetricCards, type Kpi } from "@/components/dashboard/MetricCards";
import { GeoMap } from "@/components/maps/GeoMap";
import { Button } from "@/components/ui/button";
import { Avatar, Card, CardHeader, EmptyState, Input, PageHeader, Select, Skeleton } from "@/components/ui/primitives";
import { StatusPill } from "@/components/ui/status-pill";
import { qs, type Paginated } from "@/lib/api";
import { can, useSession } from "@/lib/client/session";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { formatBS } from "@/lib/dates";
import { formatDate, timeAgo, titleCase } from "@/lib/utils";

type Overview = {
  role: Role;
  period: { from: string; to: string; days: number };
  kpis: Kpi[];
  series: SeriesRow[];
  breakdowns: Record<string, Slice[]>;
  scope?: { municipality: string };
  notice?: string;
  nextDue?: { petId: string; petName: string; date: string } | null;
  pets?: { id: string; name: string; status: string; lost: boolean; nextDue: string | null }[];
};

type RecentIncident = { id: string; animalType: string; severity: string; status: string; suspectedRabies: boolean; address: string | null; incidentDate: string; wardNumber: number | null };

const SERIES: Record<"monitoring" | "VET_CLINIC" | "RESCUE_ORG" | "PET_OWNER", SeriesDef[]> = {
  monitoring: [
    { key: "incidents", label: "Bite incidents", color: "var(--chart-1)" },
    { key: "suspected", label: "Suspected rabies", color: "var(--chart-5)" },
    { key: "vaccinations", label: "Vaccinations", color: "var(--chart-3)" },
    { key: "cnvr", label: "CNVR", color: "var(--chart-4)" },
  ],
  VET_CLINIC: [{ key: "vaccinations", label: "Vaccinations administered", color: "var(--chart-3)" }],
  RESCUE_ORG: [
    { key: "strays", label: "Strays registered", color: "var(--chart-1)" },
    { key: "sterilizations", label: "Sterilisations", color: "var(--chart-4)" },
    { key: "vaccinations", label: "Vaccinations", color: "var(--chart-3)" },
  ],
  PET_OWNER: [{ key: "scans", label: "QR tag scans", color: "var(--chart-2)" }],
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

function RecentIncidents() {
  const { data } = useSWR<Paginated<RecentIncident>>("/incidents?limit=6&sort=createdAt&order=desc");
  return (
    <Card>
      <CardHeader title="Latest reports" description="Newest bite and suspected-rabies submissions" action={<Button asChild size="sm" variant="ghost"><Link href="/app/incidents">View all <ArrowRight /></Link></Button>} />
      <ul className="divide-y divide-border">
        {!data && Array.from({ length: 4 }).map((_, i) => <li key={i} className="px-5 py-3"><Skeleton className="h-9 w-full" /></li>)}
        {data?.data.length === 0 && <EmptyState title="No incidents reported" />}
        {data?.data.map((i) => (
          <li key={i.id}>
            <Link href={`/app/incidents?open=${i.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2">
              <span className={`size-2 shrink-0 rounded-full ${i.suspectedRabies ? "animate-pulse-dot bg-danger text-danger" : i.severity === "HIGH" ? "bg-warning" : "bg-info"}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{titleCase(i.animalType)} bite · {i.address ?? "Unknown location"}</p>
                <p className="text-xs text-muted">{timeAgo(i.incidentDate)}{i.wardNumber ? ` · Ward ${i.wardNumber}` : ""}{i.suspectedRabies ? " · suspected rabies" : ""}</p>
              </div>
              <StatusPill status={i.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OwnerPets({ data }: { data?: Overview }) {
  return (
    <Card>
      <CardHeader title="Your pets" description="Vaccination status at a glance" action={<Button asChild size="sm" variant="ghost"><Link href="/app/pets">Manage <ArrowRight /></Link></Button>} />
      <ul className="divide-y divide-border">
        {!data && <li className="p-5"><Skeleton className="h-20 w-full" /></li>}
        {data?.pets?.length === 0 && <EmptyState icon={<PawPrint />} title="No pets yet" description="Register your pet to get a QR tag and booster reminders." action={<Button asChild size="sm" variant="primary"><Link href="/app/pets?new=1"><Plus /> Register a pet</Link></Button>} />}
        {data?.pets?.map((p) => (
          <li key={p.id}>
            <Link href={`/app/pets/${p.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2">
              <Avatar name={p.name} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{p.name}</p>
                <p className="text-xs text-muted">{p.nextDue ? `Next booster ${formatDate(p.nextDue)}` : "No booster scheduled"}</p>
              </div>
              {p.lost && <StatusPill status="ACTIVE" />}
              <StatusPill status={p.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function DashboardPage() {
  const session = useSession();
  const [days, setDays] = useState(30);
  const { data, isLoading } = useSWR<Overview>(`/stats/overview${qs({ days })}`, { keepPreviousData: true });
  const monitoring = can(session, "WARD_OFFICER");
  const seriesKey = monitoring ? "monitoring" : (session.role as "VET_CLINIC" | "RESCUE_ORG" | "PET_OWNER");
  const b = data?.breakdowns ?? {};
  const periodLabel = `${days} days`;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      <PageHeader
        title={`${greeting()}, ${session.fullName.replace(/^Dr\.?\s+/, "").split(" ")[0]}`}
        description={
          <>
            {ROLE_LABEL[session.role]} dashboard
            {data?.scope ? ` · ${data.scope.municipality}` : ""}
            {data ? ` · ${formatDate(data.period.from)} – ${formatDate(data.period.to)}` : ""}
            {data && formatBS(data.period.to) ? <span className="font-deva" lang="ne">{` (${formatBS(data.period.from)} – ${formatBS(data.period.to)})`}</span> : null}
          </>
        }
        actions={
          <>
            <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 w-36" aria-label="Period">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </Select>
            {monitoring && (
              <Button asChild variant="secondary">
                <Link href="/app/reports"><Download /> Export</Link>
              </Button>
            )}
            {session.role === "PET_OWNER" ? (
              <Button asChild variant="primary"><Link href="/app/pets?new=1"><Plus /> Register pet</Link></Button>
            ) : session.role === "VET_CLINIC" ? (
              <Button asChild variant="primary"><Link href="/app/vaccinations?status=PENDING_VERIFICATION"><Syringe /> Verification queue</Link></Button>
            ) : (
              <Button asChild variant="primary"><Link href="/app/map"><MapIcon /> Open map</Link></Button>
            )}
          </>
        }
      />

      {session.role === "VET_CLINIC" && <PatientLookup />}

      {data?.notice && <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">{data.notice}</p>}
      {data?.nextDue && (
        <Link href={`/app/pets/${data.nextDue.petId}`} className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm transition hover:border-warning/50">
          <Syringe className="size-5 text-warning" />
          <span className="flex-1 text-fg">
            {(() => {
              const days = Math.round((new Date(data.nextDue.date).getTime() - Date.now()) / 86_400_000);
              return days < 0 ? (
                <><strong>{data.nextDue.petName}</strong>&apos;s booster was due <strong>{formatDate(data.nextDue.date)}</strong> — overdue by {-days} day{days === -1 ? "" : "s"}. Visit a registered clinic.</>
              ) : (
                <><strong>{data.nextDue.petName}</strong>&apos;s next booster is due <strong>{formatDate(data.nextDue.date)}</strong> ({days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}).</>
              );
            })()}
          </span>
          <ArrowRight className="size-4 text-muted" />
        </Link>
      )}

      <MetricCards kpis={data?.kpis} periodLabel={periodLabel} loading={isLoading && !data} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActivityChart title="Activity over time" description={`Daily counts for the last ${days} days`} data={data?.series} defs={SERIES[seriesKey]} loading={isLoading && !data} />
        </div>
        {monitoring ? (
          <DistributionChart title="Incident status" description="Where reports are in the workflow" data={b.incidentsByStatus} loading={!data} />
        ) : session.role === "VET_CLINIC" ? (
          <DistributionChart title="Vaccines administered" data={b.byVaccine} loading={!data} />
        ) : session.role === "RESCUE_ORG" ? (
          <DistributionChart title="Strays by gender" description="Registered in this period" data={b.straysByGender} loading={!data} />
        ) : (
          <DistributionChart title="Your pets' status" data={b.petsByStatus} loading={!data} />
        )}
      </div>

      {monitoring && (
        <div className="grid gap-4 lg:grid-cols-3">
          <RankingChart title="Most affected wards" description="Incident reports by ward" data={b.incidentsByWard} loading={!data} />
          <DistributionChart title="Severity" data={b.incidentsBySeverity} loading={!data} />
          <RecentIncidents />
        </div>
      )}

      {session.role === "RESCUE_ORG" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <RankingChart title="Strays by municipality" data={b.straysByMunicipality} loading={!data} />
          <Card className="overflow-hidden lg:col-span-2">
            <CardHeader title="Stray & CNVR map" description="Sterilised strays in green, not yet sterilised in amber" action={<Button asChild size="sm" variant="ghost"><Link href="/app/map">Full map <ArrowRight /></Link></Button>} />
            <GeoMap layers={["strays", "cnvr", "incidents"]} defaultLayers={["strays", "cnvr"]} className="h-80 rounded-none border-0" />
          </Card>
        </div>
      )}

      {session.role === "VET_CLINIC" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <DistributionChart title="Record status" description="Records created in this period" data={b.byStatus} loading={!data} />
          <Card className="flex flex-col justify-center gap-3 p-6">
            <ShieldAlert className="size-6 text-muted" />
            <p className="text-sm text-fg">Owners can submit paper vaccination cards for your clinic to verify. Pending records appear in your verification queue.</p>
            <div><Button asChild variant="primary" size="sm"><Link href="/app/vaccinations?status=PENDING_VERIFICATION">Open queue <ArrowRight /></Link></Button></div>
          </Card>
        </div>
      )}

      {session.role === "PET_OWNER" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <OwnerPets data={data} />
          <Card className="overflow-hidden">
            <CardHeader title="Vets & shelters near you" action={<Button asChild size="sm" variant="ghost"><Link href="/app/map">Open map <ArrowRight /></Link></Button>} />
            <GeoMap layers={["clinics", "shelters", "lost"]} defaultLayers={["clinics", "shelters"]} className="h-80 rounded-none border-0" />
          </Card>
        </div>
      )}
    </div>
  );
}

/** Vet front desk: find a patient by pet name, owner name/phone or QR code, then record or verify vaccinations. */
function PatientLookup() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const go = () => {
    const v = q.trim();
    // A pasted QR link (…/p/<token>) is reduced to its token.
    const token = v.match(/\/p\/([\w-]+)/)?.[1];
    router.push(`/app/pets${v ? `?query=${encodeURIComponent(token ?? v)}` : ""}`);
  };
  return (
    <Card className="p-4">
      <form onSubmit={(e) => { e.preventDefault(); go(); }} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 sm:w-64">
          <PawPrint className="size-5 shrink-0 text-accent" />
          <div>
            <p className="text-sm font-semibold text-fg">Find a patient</p>
            <p className="text-xs text-muted">Pet name, owner name or phone, or QR code</p>
          </div>
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Bhalu, 98XXXXXXXX or a scanned QR link" className="pl-9" aria-label="Find a patient" />
        </div>
        <Button type="submit" variant="primary"><Search /> Search</Button>
      </form>
    </Card>
  );
}
