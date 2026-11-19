// Shared helpers for KPI cards (period-over-period deltas, sparklines) and time series.
const DAY = 86_400_000;

export type Period = { from: Date; to: Date; prevFrom: Date; days: number };

export function period(days: number, now = new Date()): Period {
  const to = now;
  const from = new Date(to.getTime() - days * DAY);
  return { from, to, prevFrom: new Date(from.getTime() - days * DAY), days };
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Daily buckets (UTC) from `from` for `days` days, zero-filled so charts never have gaps. */
export function dailySeries(from: Date, days: number): string[] {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Array.from({ length: days + 1 }, (_, i) => isoDay(new Date(start + i * DAY)));
}

export function countByDay(dates: Date[], keys: string[]): number[] {
  const m = new Map(keys.map((k) => [k, 0]));
  for (const d of dates) {
    const k = isoDay(d);
    if (m.has(k)) m.set(k, m.get(k)! + 1);
  }
  return keys.map((k) => m.get(k)!);
}

/** Zero-filled multi-series rows for Recharts: [{ date, a: n, b: n }, ...]. Each column is bucketed once. */
export function seriesFrom(keys: string[], columns: Record<string, Date[]>) {
  const counted = Object.entries(columns).map(([name, dates]) => [name, countByDay(dates, keys)] as const);
  return keys.map((date, i) => ({ date, ...Object.fromEntries(counted.map(([name, arr]) => [name, arr[i]!])) }));
}

export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // undefined growth from zero
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export type Kpi = {
  key: string;
  label: string;
  value: number;
  previous: number | null;
  deltaPct: number | null;
  /** true when an increase is good news (vaccinations), false when bad (incidents). */
  higherIsBetter: boolean;
  sparkline: number[];
};

export function kpi(
  key: string,
  label: string,
  currentDates: Date[],
  previousCount: number | null,
  keys: string[],
  higherIsBetter: boolean,
  valueOverride?: number,
): Kpi {
  const value = valueOverride ?? currentDates.length;
  return {
    key,
    label,
    value,
    previous: previousCount,
    deltaPct: previousCount === null ? null : deltaPct(value, previousCount),
    higherIsBetter,
    sparkline: countByDay(currentDates, keys),
  };
}

export function tally<T>(items: T[], key: (t: T) => string | null | undefined) {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it) ?? "Unknown";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
