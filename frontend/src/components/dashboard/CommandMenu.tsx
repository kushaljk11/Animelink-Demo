"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { Activity, ArrowRight, Building2, CornerDownLeft, Dog, FileDown, LogOut, Moon, PawPrint, Plus, Search, ShieldAlert, Stethoscope, Sun, Users, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Kbd } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { can, useSession } from "@/lib/client/session";
import { navFor } from "@/lib/nav";
import { useI18n } from "@/lib/i18n/context";

type Hit = { type: string; id: string; title: string; subtitle: string; href: string; score: number };
type SearchResponse = { query: string; total: number; groups: Record<string, Hit[]> };

const GROUP_META: Record<string, { label: string; icon: LucideIcon }> = {
  pets: { label: "Pets", icon: PawPrint },
  incidents: { label: "Incidents", icon: Activity },
  strays: { label: "Strays", icon: Dog },
  clinics: { label: "Clinics", icon: Stethoscope },
  organizations: { label: "Rescue organisations", icon: Building2 },
  users: { label: "Users", icon: Users },
};

/** Subsequence fuzzy match used for local nav/actions (server ranks entity hits). */
function fuzzy(q: string, text: string) {
  if (!q) return true;
  const t = text.toLowerCase();
  let i = 0;
  for (const ch of q.toLowerCase().replace(/\s+/g, "")) {
    i = t.indexOf(ch, i);
    if (i < 0) return false;
    i++;
  }
  return true;
}

const itemClass =
  "group flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-soft data-[selected=true]:bg-surface-2 data-[selected=true]:text-fg [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted";
const groupClass = "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted";

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const session = useSession();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(null);
    }
  }, [open]);

  // Debounced entity search against /api/search (role-aware on the server).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<SearchResponse>(`/search?q=${encodeURIComponent(q)}&limit=5`, { signal: ctrl.signal })
        .then((d) => setResults(d))
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const { navLabel } = useI18n();
  const nav = useMemo(() => navFor(session.role, navLabel).flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))), [session.role, navLabel]);

  const actions = useMemo(() => {
    const list: { id: string; label: string; icon: LucideIcon; run: () => void; hint?: string }[] = [
      { id: "theme", label: `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`, icon: resolvedTheme === "dark" ? Sun : Moon, run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark") },
      { id: "report", label: "Report a bite / suspected rabies incident", icon: ShieldAlert, run: () => router.push("/submit") },
    ];
    if (session.role === "PET_OWNER") list.push({ id: "pet", label: "Register a new pet", icon: Plus, run: () => router.push("/app/pets?new=1") });
    if (can(session, "WARD_OFFICER", "VET_CLINIC", "RESCUE_ORG")) list.push({ id: "export", label: "Export a report (CSV / PDF)", icon: FileDown, run: () => router.push("/app/reports") });
    list.push({
      id: "logout",
      label: "Sign out",
      icon: LogOut,
      run: () => {
        void api("/auth/logout", { method: "POST" }).finally(() => (window.location.href = "/login"));
      },
    });
    return list;
  }, [resolvedTheme, router, session, setTheme]);

  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  const navMatches = nav.filter((n) => fuzzy(query, `${n.label} ${n.group}`));
  const actionMatches = actions.filter((a) => fuzzy(query, a.label));
  const groups = Object.entries(results?.groups ?? {}).filter(([, hits]) => hits.length);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1200] animate-fade-in bg-black/50 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-[1201] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 animate-zoom-in overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search records, jump to pages and run actions</DialogPrimitive.Description>
          <Command shouldFilter={false} loop className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 text-muted" />
              <Command.Input value={query} onValueChange={setQuery} placeholder="Search pets, incidents, strays, clinics… or type a command" className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted" />
              {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-border-strong border-t-fg" />}
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="scroll-thin max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-10 text-center text-sm text-muted">{query.length >= 2 && loading ? "Searching…" : "No matches."}</Command.Empty>

              {groups.map(([type, hits]) => {
                const meta = GROUP_META[type] ?? { label: type, icon: ArrowRight };
                const Icon = meta.icon;
                return (
                  <Command.Group key={type} heading={meta.label} className={groupClass}>
                    {hits.map((h) => (
                      <Command.Item key={`${type}:${h.id}`} value={`${type}:${h.id}`} onSelect={() => go(() => router.push(h.href))} className={itemClass}>
                        <Icon />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-fg">{h.title}</span>
                          <span className="block truncate text-xs text-muted">{h.subtitle}</span>
                        </span>
                        <CornerDownLeft className="opacity-0 group-data-[selected=true]:opacity-100" />
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}

              {navMatches.length > 0 && (
                <Command.Group heading="Go to" className={groupClass}>
                  {navMatches.map((n) => {
                    const Icon = n.icon;
                    return (
                      <Command.Item key={n.href} value={`nav:${n.href}`} onSelect={() => go(() => router.push(n.href))} className={itemClass}>
                        <Icon />
                        <span className="flex-1">{n.label}</span>
                        <span className="text-xs text-muted">{n.group}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {actionMatches.length > 0 && (
                <Command.Group heading="Actions" className={groupClass}>
                  {actionMatches.map((a) => {
                    const Icon = a.icon;
                    return (
                      <Command.Item key={a.id} value={`action:${a.id}`} onSelect={() => go(a.run)} className={itemClass}>
                        <Icon />
                        <span>{a.label}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-border bg-surface-2 px-4 py-2 text-[11px] text-muted">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
              <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
              <span className="ml-auto">{results ? `${results.total} records` : "Type 2+ characters to search records"}</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
