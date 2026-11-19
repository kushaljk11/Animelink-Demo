"use client";

import { CheckCircle2 } from "lucide-react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { Skeleton } from "@/components/ui/primitives";
import { formatBS } from "@/lib/dates";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { formatDate } from "@/lib/utils";
import type { Milestone } from "./MilestoneMapInner";

const Inner = dynamic(() => import("./MilestoneMapInner"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });

/** Landing-page widget: recently resolved cases from GET /public/milestones (coarse, anonymous). */
export function MilestoneMap() {
  const { t } = useI18n();
  const { data, error } = useSWR<{ days: number; total: number; data: Milestone[] }>("/public/milestones", { refreshInterval: 120_000 });
  const animal = (a: string) => t(`animal.${a}` as MessageKey);
  const label = (m: Milestone) => `${animal(m.animalType)} · ${m.area ?? ""} · ${t("map.resolvedIn", { days: m.daysToResolve })} · ${formatDate(m.resolvedAt)} | ${formatBS(m.resolvedAt) ?? ""}`;
  const recent = (data?.data ?? []).slice(0, 4);

  return (
    <div className="grid overflow-hidden rounded-2xl border border-border bg-surface shadow-card lg:grid-cols-[1fr_300px]">
      <div className="relative isolate h-80 lg:h-[420px]">
        {error ? <div className="flex h-full items-center justify-center text-sm text-muted">{t("map.empty")}</div> : <Inner points={data?.data ?? []} label={label} />}
        {data && (
          <span className="pointer-events-none absolute left-3 top-3 z-[500] inline-flex items-center gap-1.5 rounded-full border border-border bg-bg/80 px-3 py-1 text-xs font-medium text-fg backdrop-blur">
            <span className="size-2 rounded-full bg-success" /> {t("map.count", { count: data.total })}
          </span>
        )}
      </div>
      <ul className="divide-y divide-border border-t border-border lg:border-l lg:border-t-0" aria-label={t("map.title")}>
        {!data && Array.from({ length: 4 }).map((_, i) => <li key={i} className="p-4"><Skeleton className="h-10 w-full" /></li>)}
        {data && recent.length === 0 && <li className="p-4 text-sm text-muted">{t("map.empty")}</li>}
        {recent.map((m, i) => (
          <li key={i} className="flex gap-3 p-4">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-fg">
                {animal(m.animalType)} · <span className="text-fg-soft">{m.area ?? "—"}</span>
              </p>
              <p className="text-xs text-muted">{t("map.resolvedIn", { days: m.daysToResolve })}</p>
              <p className="text-xs text-muted">
                {formatDate(m.resolvedAt)} <span className="text-muted/60">|</span> <span className="font-deva" lang="ne">{formatBS(m.resolvedAt)}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
