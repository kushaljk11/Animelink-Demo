import { STATUS_TONE, TONE_CLASSES, type Tone } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Status pill with a glowing pulse dot for statuses that need attention. */
export function StatusPill({ status, tone, label, live, className }: { status: string; tone?: Tone; label?: string; live?: boolean; className?: string }) {
  const meta = STATUS_TONE[status] ?? { tone: "neutral" as Tone };
  const t = TONE_CLASSES[tone ?? meta.tone];
  const isLive = live ?? meta.live ?? false;
  const text = label ?? meta.label ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", t.pill, className)}>
      <span className={cn("size-1.5 rounded-full", t.dot, isLive && "animate-pulse-dot")} />
      {text}
    </span>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", TONE_CLASSES[tone].pill, className)}>{children}</span>;
}
