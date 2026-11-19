import { cn } from "@/lib/utils";

/** Logomark: shield + paw, drawn inline so it themes with currentColor. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg shadow-card", className)}>
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2.8 4.5 5.6v5.6c0 4.6 3.1 8.6 7.5 10 4.4-1.4 7.5-5.4 7.5-10V5.6L12 2.8Z" />
        <circle cx="9.3" cy="9.6" r="1" fill="currentColor" stroke="none" />
        <circle cx="14.7" cy="9.6" r="1" fill="currentColor" stroke="none" />
        <circle cx="7.9" cy="12.4" r="0.95" fill="currentColor" stroke="none" />
        <circle cx="16.1" cy="12.4" r="0.95" fill="currentColor" stroke="none" />
        <path d="M12 12.6c-1.6 0-2.9 1.4-2.9 2.7 0 .9.8 1.3 1.6 1.1.5-.1.9-.3 1.3-.3s.8.2 1.3.3c.8.2 1.6-.2 1.6-1.1 0-1.3-1.3-2.7-2.9-2.7Z" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-col leading-tight", className)}>
      <span className="truncate text-sm font-semibold tracking-tight text-fg">Rabies Track</span>
      <span className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Nepal · One Health</span>
    </span>
  );
}
