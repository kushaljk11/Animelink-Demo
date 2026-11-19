"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Avatar } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { useSession } from "@/lib/client/session";
import { ROLE_LABEL } from "@/lib/constants";
import { navFor, type BadgeKey, type NavItem } from "@/lib/nav";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { BrandName, Logo } from "./Brand";

type Counts = Record<BadgeKey, number>;
const GROUPS_KEY = "rtn.sidebar.groups";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function CountBadge({ n, collapsed }: { n: number; collapsed?: boolean }) {
  if (!n) return null;
  if (collapsed) return <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger ring-2 ring-surface" />;
  return <span className="ml-auto rounded-full bg-danger/15 px-1.5 py-px text-[10px] font-semibold tabular-nums text-danger">{n > 99 ? "99+" : n}</span>;
}

function NavLink({ item, active, collapsed, count, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; count: number; onNavigate?: () => void }) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
        collapsed ? "mx-auto size-10 justify-center" : "h-9 px-2.5",
        active ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {active && !collapsed && <span className="absolute -left-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />}
      <Icon className={cn("size-[18px] shrink-0", active ? "text-fg" : "text-muted group-hover:text-fg")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      <CountBadge n={count} collapsed={collapsed} />
    </Link>
  );
  return collapsed ? (
    <Tooltip side="right" content={<span className="flex items-center gap-2">{item.label}{count ? <span className="rounded-full bg-danger/15 px-1.5 text-[10px] text-danger">{count}</span> : null}</span>}>
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export function Sidebar({ collapsed, onToggle, onNavigate, mobile }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void; mobile?: boolean }) {
  const session = useSession();
  const pathname = usePathname();
  const { navLabel } = useI18n();
  const groups = navFor(session.role, navLabel);
  const { data: counts } = useSWR<Counts>("/nav-counts", { refreshInterval: 60_000 });
  const [closedGroups, setClosedGroups] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(GROUPS_KEY);
      if (saved) setClosedGroups(JSON.parse(saved) as string[]);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggleGroup = (id: string, open: boolean) => {
    const next = open ? closedGroups.filter((g) => g !== id) : [...closedGroups, id];
    setClosedGroups(next);
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <aside className={cn("flex h-full flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out", mobile ? "w-full" : collapsed ? "w-[68px]" : "w-64")}>
      <div className={cn("flex h-14 shrink-0 items-center border-b border-border", collapsed ? "justify-center px-2" : "gap-2.5 px-4")}>
        <Link href="/app/dashboard" className="flex min-w-0 items-center gap-2.5" onClick={onNavigate}>
          <Logo />
          {!collapsed && <BrandName />}
        </Link>
        {!collapsed && onToggle && (
          <Tooltip content="Collapse sidebar" side="right">
            <button onClick={onToggle} className="ml-auto rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Collapse sidebar">
              <PanelLeftClose className="size-4" />
            </button>
          </Tooltip>
        )}
      </div>

      <nav className={cn("scroll-thin flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-3")} aria-label="Main">
        {groups.map((group, gi) => {
          const groupCount = group.items.reduce((s, i) => s + (i.badge ? (counts?.[i.badge] ?? 0) : 0), 0);
          if (collapsed) {
            return (
              <div key={group.id} className={cn("flex flex-col gap-1", gi > 0 && "mt-2 border-t border-border pt-2")}>
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} collapsed active={isActive(pathname, item.href)} count={item.badge ? (counts?.[item.badge] ?? 0) : 0} onNavigate={onNavigate} />
                ))}
              </div>
            );
          }
          const open = !closedGroups.includes(group.id);
          return (
            <Collapsible.Root key={group.id} open={open} onOpenChange={(o) => toggleGroup(group.id, o)} className={cn(gi > 0 && "mt-3")}>
              <Collapsible.Trigger className="group/trigger flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-fg">
                <span>{group.label}</span>
                {!open && groupCount > 0 && <span className="size-1.5 rounded-full bg-danger" />}
                <ChevronDown className={cn("ml-auto size-3.5 transition-transform", !open && "-rotate-90")} />
              </Collapsible.Trigger>
              <Collapsible.Content className="mt-1 flex flex-col gap-0.5 overflow-hidden data-[state=closed]:animate-fade-in">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} collapsed={false} active={isActive(pathname, item.href)} count={item.badge ? (counts?.[item.badge] ?? 0) : 0} onNavigate={onNavigate} />
                ))}
              </Collapsible.Content>
            </Collapsible.Root>
          );
        })}
      </nav>

      <div className={cn("shrink-0 border-t border-border", collapsed ? "flex flex-col items-center gap-2 p-2" : "p-3")}>
        {collapsed ? (
          <>
            {onToggle && (
              <Tooltip content="Expand sidebar" side="right">
                <button onClick={onToggle} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Expand sidebar">
                  <PanelLeftOpen className="size-4" />
                </button>
              </Tooltip>
            )}
            <Tooltip side="right" content={`${session.fullName} · ${ROLE_LABEL[session.role]}`}>
              <span>
                <Avatar name={session.fullName} />
              </span>
            </Tooltip>
          </>
        ) : (
          <Link href="/app/settings" onClick={onNavigate} className="flex items-center gap-2.5 rounded-lg bg-surface-2 p-2 transition hover:bg-surface-3" title="Settings & profile">
            <Avatar name={session.fullName} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{session.fullName}</p>
              <p className="truncate text-xs text-muted">{ROLE_LABEL[session.role]}{session.municipality ? ` · ${session.municipality.replace(" Metropolitan City", "").replace(" Municipality", "")}` : ""}</p>
            </div>
          </Link>
        )}
      </div>
    </aside>
  );
}
