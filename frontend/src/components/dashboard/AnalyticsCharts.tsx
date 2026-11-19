"use client";

import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { cn, titleCase } from "@/lib/utils";

export type SeriesDef = { key: string; label: string; color: string };
export type SeriesRow = { date: string } & Record<string, number | string>;
export type Slice = { name: string; count: number };

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--violet)", "var(--muted)"];
const STATUS_COLORS: Record<string, string> = {
  REPORTED: "var(--info)",
  UNDER_REVIEW: "var(--warning)",
  VERIFIED: "var(--success)",
  RESOLVED: "var(--muted)",
  DISMISSED: "var(--border-strong)",
  HIGH: "var(--danger)",
  MODERATE: "var(--warning)",
  LOW: "var(--chart-2)",
  OVERDUE: "var(--danger)",
  DUE_SOON: "var(--warning)",
  UP_TO_DATE: "var(--success)",
  PENDING_VERIFICATION: "var(--warning)",
  NOT_VACCINATED: "var(--danger)",
  NO_BOOSTER: "var(--muted)",
};

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function ChartTooltip({ active, payload, label, defs }: TooltipProps<number, string> & { defs?: SeriesDef[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop">
      {label && <p className="mb-1.5 font-medium text-fg">{typeof label === "string" && /^\d{4}-/.test(label) ? shortDate(label) : titleCase(String(label))}</p>}
      {payload.map((p) => {
        const def = defs?.find((d) => d.key === p.dataKey);
        return (
          <div key={String(p.dataKey ?? p.name)} className="flex items-center gap-2 py-0.5">
            <span className="size-2 rounded-sm" style={{ background: def?.color ?? (p.payload as { fill?: string })?.fill ?? p.color }} />
            <span className="flex-1 text-muted">{def?.label ?? titleCase(String(p.name))}</span>
            <span className="font-semibold tabular-nums text-fg">{p.value}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 30-day activity area chart with click-to-toggle legend. */
export function ActivityChart({ title, description, data, defs, loading }: { title: string; description?: string; data?: SeriesRow[]; defs: SeriesDef[]; loading?: boolean }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const totals = Object.fromEntries(defs.map((d) => [d.key, (data ?? []).reduce((s, r) => s + Number(r[d.key] ?? 0), 0)]));
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={title}
        description={description}
        action={
          <div className="flex flex-wrap justify-end gap-1.5">
            {defs.map((d) => {
              const off = hidden.includes(d.key);
              return (
                <button
                  key={d.key}
                  onClick={() => setHidden((h) => (off ? h.filter((k) => k !== d.key) : [...h, d.key]))}
                  className={cn("flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] transition", off ? "opacity-40" : "bg-surface-2")}
                  aria-pressed={!off}
                >
                  <span className="size-2 rounded-sm" style={{ background: d.color }} />
                  <span className="text-fg-soft">{d.label}</span>
                  <span className="font-semibold tabular-nums text-fg">{totals[d.key]}</span>
                </button>
              );
            })}
          </div>
        }
      />
      <div className="h-72 px-2 pb-3 pt-4">
        {loading || !data ? (
          <Skeleton className="mx-3 h-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
              <defs>
                {defs.map((d) => (
                  <linearGradient key={d.key} id={`ac-${d.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={d.color} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={d.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<ChartTooltip defs={defs} />} cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 3" }} />
              {defs
                .filter((d) => !hidden.includes(d.key))
                .map((d) => (
                  <Area key={d.key} type="monotone" dataKey={d.key} name={d.label} stroke={d.color} strokeWidth={2} fill={`url(#ac-${d.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

/** Donut with centre total and a ranked legend. */
export function DistributionChart({ title, description, data, loading }: { title: string; description?: string; data?: Slice[]; loading?: boolean }) {
  const total = (data ?? []).reduce((s, d) => s + d.count, 0);
  const colored = (data ?? []).map((d, i) => ({ ...d, fill: STATUS_COLORS[d.name] ?? PALETTE[i % PALETTE.length]! }));
  return (
    <Card className="flex flex-col">
      <CardHeader title={title} description={description} />
      {loading || !data ? (
        <div className="p-5">
          <Skeleton className="mx-auto size-40 rounded-full" />
        </div>
      ) : total === 0 ? (
        <EmptyState title="No data in this period" />
      ) : (
        <div className="flex flex-col items-center gap-4 p-5 sm:flex-row lg:flex-col 2xl:flex-row">
          <div className="relative size-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={colored} dataKey="count" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
                  {colored.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums text-fg">{total}</span>
              <span className="text-[11px] text-muted">total</span>
            </div>
          </div>
          <ul className="w-full space-y-1.5">
            {colored.map((d) => (
              <li key={d.name} className="flex items-center gap-2 text-xs">
                <span className="size-2.5 rounded-sm" style={{ background: d.fill }} />
                <span className="flex-1 truncate text-fg-soft">{titleCase(d.name)}</span>
                <span className="tabular-nums text-muted">{Math.round((d.count / total) * 100)}%</span>
                <span className="w-8 text-right font-semibold tabular-nums text-fg">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** Horizontal ranking bars (e.g. incidents by ward). */
export function RankingChart({ title, description, data, loading }: { title: string; description?: string; data?: Slice[]; loading?: boolean }) {
  const rows = (data ?? []).slice(0, 8);
  return (
    <Card className="flex flex-col">
      <CardHeader title={title} description={description} />
      <div className="h-72 px-2 py-3">
        {loading || !data ? (
          <Skeleton className="mx-3 h-full" />
        ) : rows.length === 0 ? (
          <EmptyState title="No data in this period" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                tick={{ fill: "var(--fg-soft)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) => v.replace(" Metropolitan City", "").replace(" Municipality", "")}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-2)" }} />
              <Bar dataKey="count" name="Reports" radius={[0, 6, 6, 0]} fill="var(--chart-1)" barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
