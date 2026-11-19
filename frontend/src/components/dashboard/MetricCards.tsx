"use client";

import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Dog, HeartHandshake, Minus, PawPrint, QrCode, ScanLine, ShieldAlert, Stethoscope, Syringe, type LucideIcon } from "lucide-react";
import { useId } from "react";
import { Card, Skeleton } from "@/components/ui/primitives";
import { cn, compact } from "@/lib/utils";

export type Kpi = {
  key: string;
  label: string;
  value: number;
  previous: number | null;
  deltaPct: number | null;
  higherIsBetter: boolean;
  sparkline: number[];
  of?: number;
};

const ICONS: Record<string, LucideIcon> = {
  incidents: Activity,
  suspected: ShieldAlert,
  cnvr: HeartHandshake,
  vaccinations: Syringe,
  open: AlertTriangle,
  lost: PawPrint,
  pending: Stethoscope,
  patients: PawPrint,
  dueSoon: Syringe,
  overdue: AlertTriangle,
  strays: Dog,
  sterilizations: HeartHandshake,
  strayVaccinations: Syringe,
  registeredSterilized: HeartHandshake,
  pets: PawPrint,
  attention: AlertTriangle,
  scans: ScanLine,
  unread: Bell,
  reports: QrCode,
};

/** Area sparkline in raw SVG — no chart library cost per card. */
export function Sparkline({ data, tone, className }: { data: number[]; tone: "up" | "down" | "flat"; className?: string }) {
  const id = useId().replace(/:/g, "");
  if (data.length < 2) return null;
  const w = 120;
  const h = 36;
  const max = Math.max(...data, 1);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const color = tone === "up" ? "var(--success)" : tone === "down" ? "var(--danger)" : "var(--muted)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-9 w-full", className)} aria-hidden>
      <defs>
        <linearGradient id={`sg${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#sg${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DeltaBadge({ kpi }: { kpi: Kpi }) {
  if (kpi.deltaPct === null) {
    return kpi.previous === null ? null : <span className="text-[11px] text-muted">new this period</span>;
  }
  const d = kpi.deltaPct;
  const good = d === 0 ? null : d > 0 === kpi.higherIsBetter;
  const Icon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset",
        good === null ? "bg-surface-3 text-muted ring-border" : good ? "bg-success/10 text-success ring-success/25" : "bg-danger/10 text-danger ring-danger/25",
      )}
      title={`Previous period: ${kpi.previous}`}
    >
      <Icon className="size-3" />
      {d > 0 ? "+" : ""}
      {d.toFixed(1)}%
    </span>
  );
}

export function MetricCard({ kpi, periodLabel }: { kpi: Kpi; periodLabel: string }) {
  const Icon = ICONS[kpi.key] ?? Activity;
  const trend = kpi.deltaPct === null || kpi.deltaPct === 0 ? "flat" : kpi.deltaPct > 0 === kpi.higherIsBetter ? "up" : "down";
  return (
    <Card className="group relative overflow-hidden p-4 transition hover:border-border-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted">{kpi.label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-fg">
            {compact(kpi.value)}
            {kpi.of !== undefined && <span className="ml-1 text-sm font-normal text-muted">/ {compact(kpi.of)}</span>}
          </p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted group-hover:text-fg">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <DeltaBadge kpi={kpi} />
          <span className="text-[11px] text-muted">{kpi.deltaPct !== null ? `vs previous ${periodLabel}` : kpi.sparkline.length ? periodLabel : "current total"}</span>
        </div>
        <div className="w-28 shrink-0">
          <Sparkline data={kpi.sparkline} tone={trend} />
        </div>
      </div>
    </Card>
  );
}

export function MetricCards({ kpis, periodLabel, loading }: { kpis?: Kpi[]; periodLabel: string; loading?: boolean }) {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-4 h-9 w-full" />
          </Card>
        ))}
      </div>
    );
  }
  const primary = kpis.slice(0, 4);
  const secondary = kpis.slice(4);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {primary.map((k) => (
          <MetricCard key={k.key} kpi={k} periodLabel={periodLabel} />
        ))}
      </div>
      {secondary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {secondary.map((k) => {
            const Icon = ICONS[k.key] ?? Activity;
            return (
              <span key={k.key} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-muted shadow-card">
                <Icon className="size-3.5" />
                {k.label}
                <span className="font-semibold tabular-nums text-fg">{k.value}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
