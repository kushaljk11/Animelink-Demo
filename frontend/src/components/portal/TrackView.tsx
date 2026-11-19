"use client";

import { Check, CircleDot, Phone, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DualDate } from "@/components/ui/dual-date";
import { Card, Input } from "@/components/ui/primitives";
import { StatusPill } from "@/components/ui/status-pill";
import { api, ApiClientError, errorMessage, qs } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { cn, timeAgo } from "@/lib/utils";

type Tracked = {
  code: string;
  status: string;
  severity: string;
  animalType: string;
  suspectedRabies: boolean;
  incidentDate: string;
  submittedAt: string;
  lastUpdated: string;
  area: string | null;
  latestNote: string | null;
  steps: string[];
  timeline: { status: string; note: string | null; at: string }[];
};
type TrackResponse = { matchedBy: "code" | "phone"; results: Tracked[] };

const looksLikePhone = (v: string) => /^(\+?977[-\s]?)?9\d[\d\s-]{8,10}$/.test(v.trim());

function ReportCard({ data }: { data: Tracked }) {
  const { t } = useI18n();
  const st = (s: string) => t(`status.${s}` as MessageKey);
  const currentIdx = Math.max(0, data.steps.indexOf(data.status));
  return (
    <Card className="space-y-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">
            {t("track.report")} <span className="font-mono font-semibold text-fg-soft">{data.code}</span>
          </p>
          <h2 className="mt-1 text-lg font-semibold text-fg">
            {t(`animal.${data.animalType}` as MessageKey)} · {data.area ?? "—"}
          </h2>
          <p className="text-sm text-muted">
            {t("track.updated")}: {timeAgo(data.lastUpdated)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusPill status={data.status} label={st(data.status)} />
          {data.suspectedRabies && <StatusPill status="HIGH" label="Suspected rabies" />}
        </div>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">{t("track.occurred")}</dt>
          <dd className="text-fg-soft"><DualDate value={data.incidentDate} /></dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("track.submitted")}</dt>
          <dd className="text-fg-soft"><DualDate value={data.submittedAt} /></dd>
        </div>
      </dl>

      <ol className="grid gap-3 sm:grid-cols-4" aria-label="Progress">
        {data.steps.map((s, i) => {
          const done = i < currentIdx || (i === currentIdx && ["RESOLVED", "DISMISSED"].includes(s));
          const current = i === currentIdx && !done;
          const dismissed = s === "DISMISSED";
          return (
            <li key={s} className="flex items-center gap-2 sm:flex-col sm:items-start" aria-current={current ? "step" : undefined}>
              <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border-2", done ? (dismissed ? "border-muted bg-muted text-bg" : "border-success bg-success text-white dark:text-slate-950") : current ? "border-info text-info" : "border-border text-muted")}>
                {done ? dismissed ? <X className="size-3.5" /> : <Check className="size-3.5" /> : current ? <CircleDot className="size-3.5 animate-pulse" /> : <span className="text-[11px]">{i + 1}</span>}
              </span>
              <span className={cn("text-xs", current || done ? "font-medium text-fg" : "text-muted")}>{st(s)}</span>
            </li>
          );
        })}
      </ol>

      {data.latestNote && (
        <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-fg-soft">
          <strong className="text-fg">{t("track.latestNote")}:</strong> {data.latestNote}
        </p>
      )}

      <div>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{t("track.timeline")}</p>
        <ol className="relative space-y-4 border-l border-border pl-5">
          {[...data.timeline].reverse().map((e, i) => (
            <li key={`${e.at}-${i}`} className="relative">
              <span className={cn("absolute -left-[26px] top-1 size-3 rounded-full border-2 border-surface", i === 0 ? "bg-info" : "bg-border-strong")} />
              <p className="text-sm font-medium text-fg">{st(e.status)}</p>
              <p className="text-xs text-muted"><DualDate value={e.at} time /></p>
              {e.note && <p className="mt-1 text-sm text-fg-soft">{e.note}</p>}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

/** Track by NP-XXXX-XXXX code or by the 10-digit mobile used to report (GET /public/track?query=). */
export function TrackView() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<TrackResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      setLoading(true);
      try {
        const r = await api<TrackResponse>(`/public/track${qs({ query: q })}`);
        setData(r);
        const url = new URL(window.location.href);
        url.searchParams.delete("code");
        // Keep codes in the URL (shareable); never put a phone number in it.
        if (r.matchedBy === "code") url.searchParams.set("q", r.results[0]!.code);
        else url.searchParams.delete("q");
        window.history.replaceState(null, "", url);
      } catch (err) {
        setData(null);
        toast.error(err instanceof ApiClientError && err.status === 404 ? t("track.notFound") : errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("q") ?? sp.get("code"); // ?q= from SMS links, ?code= from older links
    if (c) {
      setQuery(c);
      void lookup(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phone = looksLikePhone(query);
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card className="p-4 sm:p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(query);
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <div className="relative flex-1">
            {phone ? <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /> : <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />}
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("track.placeholder")}
              className="h-11 pl-9 font-mono uppercase placeholder:normal-case"
              aria-label={t("track.placeholder")}
              autoComplete="off"
              spellCheck={false}
              inputMode={phone ? "tel" : "text"}
            />
          </div>
          <Button type="submit" variant="primary" size="lg" loading={loading} disabled={!query.trim()}>
            <Search /> {t("track.button")}
          </Button>
        </form>
      </Card>

      {data?.matchedBy === "phone" && <p className="rounded-lg border border-info/25 bg-info/5 p-3 text-xs text-fg-soft">{t("track.byPhone")}</p>}
      {data?.results.map((r) => <ReportCard key={r.code} data={r} />)}
    </div>
  );
}
