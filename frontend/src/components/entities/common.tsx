"use client";

import { Check, Copy, ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/primitives";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { DualDate } from "@/components/ui/dual-date";
import { formatDual } from "@/lib/dates";

export const shortId = (id: string) => id.slice(-8).toUpperCase();

export function IdCell({ id }: { id: string }) {
  return <span className="font-mono text-xs text-muted">#{shortId(id)}</span>;
}

/** Table date: AD with the Bikram Sambat date beneath ("relative" shows "3 days ago" with both dates on hover). */
export function DateCell({ value, relative }: { value: string | null | undefined; relative?: boolean }) {
  if (!value) return <span className="text-muted">—</span>;
  if (relative) {
    return (
      <span className="whitespace-nowrap tabular-nums text-fg-soft" title={formatDual(value, { dateStyle: "medium", timeStyle: "short" })}>
        {timeAgo(value)}
      </span>
    );
  }
  return <DualDate value={value} stacked className="text-fg-soft" />;
}

export function TitleCell({ title, subtitle, image, name }: { title: ReactNode; subtitle?: ReactNode; image?: string | null; name?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {(image !== undefined || name) && <Avatar name={name ?? String(title)} src={image} className="size-8" />}
      <div className="min-w-0">
        <p className="truncate font-medium text-fg">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

export function YesNo({ value, yes = "Yes", no = "No", danger }: { value: boolean; yes?: string; no?: string; danger?: boolean }) {
  return value ? (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", danger ? "text-danger" : "text-success")}>
      <span className={cn("size-1.5 rounded-full", danger ? "animate-pulse-dot bg-danger text-danger" : "bg-success")} />
      {yes}
    </span>
  ) : (
    <span className="text-xs text-muted">{no}</span>
  );
}

export function MapLink({ lat, lng, label = "Show on map" }: { lat: number; lng: number; label?: string }) {
  return (
    <Link href={`/app/map?focus=${lat.toFixed(5)},${lng.toFixed(5)}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
      <MapPin className="size-3.5" /> {label}
    </Link>
  );
}

export function ExternalMapLink({ lat, lng }: { lat: number; lng: number }) {
  return (
    <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
      <ExternalLink className="size-3" /> OSM
    </a>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true);
          toast.success(`${label ?? "Value"} copied`);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-surface-2 hover:text-fg"
    >
      {done ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {label ?? "Copy"}
    </button>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Timeline({ items }: { items: { key: string; title: ReactNode; meta?: ReactNode; body?: ReactNode; tone?: "default" | "success" | "danger" | "warning" }[] }) {
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {items.map((i) => (
        <li key={i.key} className="relative">
          <span
            className={cn(
              "absolute -left-[26px] top-1 size-3 rounded-full border-2 border-surface",
              i.tone === "success" ? "bg-success" : i.tone === "danger" ? "bg-danger" : i.tone === "warning" ? "bg-warning" : "bg-border-strong",
            )}
          />
          <p className="text-sm font-medium text-fg">{i.title}</p>
          {i.meta && <p className="text-xs text-muted">{i.meta}</p>}
          {i.body && <div className="mt-1 text-sm text-fg-soft">{i.body}</div>}
        </li>
      ))}
    </ol>
  );
}
