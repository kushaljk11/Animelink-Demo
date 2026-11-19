import { formatBS } from "@/lib/dates";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

/**
 * AD | BS side by side: "Nov 9, 2026 | २०८३ कार्तिक २३".
 * `stacked` puts BS on a second, muted line (tables / tight cells).
 */
export function DualDate({ value, time, stacked, className }: { value: string | Date | null | undefined; time?: boolean; stacked?: boolean; className?: string }) {
  if (!value) return <span className="text-muted">—</span>;
  const ad = time ? formatDateTime(value) : formatDate(value);
  const bs = formatBS(value);
  if (!bs) return <span className={className}>{ad}</span>;
  return stacked ? (
    <span className={cn("inline-flex flex-col leading-tight", className)}>
      <span className="whitespace-nowrap tabular-nums">{ad}</span>
      <span className="font-deva whitespace-nowrap text-[11px] text-muted" lang="ne">{bs} <span className="sr-only">BS</span></span>
    </span>
  ) : (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>
      {ad} <span className="text-muted/70">|</span>{" "}
      <span className="font-deva text-muted" lang="ne">
        {bs}
      </span>
    </span>
  );
}
