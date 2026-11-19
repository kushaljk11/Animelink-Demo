"use client";

import { Activity, Bell, BellRing, CheckCheck, ChevronsUpDown, LogOut, MessageSquare, Moon, Network, Sun, Syringe, UserCog, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlays";
import { Avatar } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { api, errorMessage, type Paginated } from "@/lib/api";
import { useSession } from "@/lib/client/session";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { cn, timeAgo } from "@/lib/utils";

// ------------------------------------------------------------ theme toggle

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const dark = !mounted || resolvedTheme === "dark";
  return (
    <Tooltip content={dark ? "Light mode" : "Dark mode"} side="bottom">
      <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(dark ? "light" : "dark")}>
        {dark ? <Sun /> : <Moon />}
      </Button>
    </Tooltip>
  );
}

// ----------------------------------------------------------- role switcher

const DEMO: { role: Role; email: string }[] = [
  { role: "ADMIN", email: "admin@local.dev" },
  { role: "WARD_OFFICER", email: "operator@local.dev" },
  { role: "PET_OWNER", email: "user@local.dev" },
  { role: "VET_CLINIC", email: "vet@local.dev" },
  { role: "RESCUE_ORG", email: "rescue@local.dev" },
];

/** Local-only: re-signs in as a seeded demo account to test RBAC views. */
export function RoleSwitcher() {
  const session = useSession();
  const [busy, setBusy] = useState<Role | null>(null);
  if (!session.roleSwitcherEnabled) return null;

  const switchTo = async (role: Role) => {
    if (role === session.role) return;
    setBusy(role);
    try {
      await api("/auth/switch-role", { method: "POST", body: { role } });
      toast.success(`Switched to ${ROLE_LABEL[role]}`);
      window.location.href = "/app/dashboard"; // full reload resets server + SWR state
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="hidden gap-1.5 md:inline-flex" aria-label="Switch demo role">
          <UserCog className="text-muted" />
          <span className="max-w-32 truncate">{ROLE_LABEL[session.role]}</span>
          <ChevronsUpDown className="text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuLabel>Local role switcher</DropdownMenuLabel>
        {DEMO.map((d) => (
          <DropdownMenuItem key={d.role} onSelect={(e) => { e.preventDefault(); void switchTo(d.role); }} disabled={busy !== null}>
            <span className={cn("size-2 rounded-full", d.role === session.role ? "bg-success" : "bg-border-strong")} />
            <span className="flex-1">
              <span className="block text-fg">{ROLE_LABEL[d.role]}</span>
              <span className="block text-xs text-muted">{d.email}</span>
            </span>
            {busy === d.role && <span className="size-3.5 animate-spin rounded-full border-2 border-border-strong border-t-fg" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2.5 py-1.5 text-[11px] text-muted">Development only — disabled in production builds.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ------------------------------------------------------------ notifications

type Notification = { id: string; type: string; title: string; message: string; link: string | null; sentAt: string | null; scheduledAt: string; readAt: string | null };

const TYPE_ICON: Record<string, { icon: LucideIcon; tone: string }> = {
  VACCINATION_REMINDER: { icon: Syringe, tone: "text-warning bg-warning/10" },
  BOOSTER_OVERDUE: { icon: Syringe, tone: "text-danger bg-danger/10" },
  LOST_PET_SCAN: { icon: BellRing, tone: "text-info bg-info/10" },
  INCIDENT_UPDATE: { icon: Activity, tone: "text-violet bg-violet/10" },
  CLUSTER_ALERT: { icon: Network, tone: "text-danger bg-danger/10" },
  CHAT_MESSAGE: { icon: MessageSquare, tone: "text-success bg-success/10" },
  ACCOUNT: { icon: Bell, tone: "text-fg-soft bg-surface-3" },
};

export function NotificationsPopover() {
  const router = useRouter();
  const { data, mutate } = useSWR<Paginated<Notification>>("/notifications?limit=12", { refreshInterval: 30_000 });
  const unread = data?.meta.unreadCount ?? 0;

  const open = async (n: Notification) => {
    if (!n.readAt) {
      void api(`/notifications/${n.id}`, { method: "PATCH", body: { read: true } }).then(() => mutate());
    }
    if (n.link) router.push(n.link);
  };

  const readAll = async () => {
    try {
      const r = await api<{ updated: number }>("/notifications/read-all", { method: "POST" });
      await mutate();
      toast.success(`Marked ${r.updated} notification${r.updated === 1 ? "" : "s"} as read`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Popover>
      <Tooltip content="Notifications" side="bottom">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Notifications (${unread} unread)`} className="relative">
            <Bell />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-bg">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-fg">Notifications</p>
            <p className="text-xs text-muted">{unread} unread</p>
          </div>
          <Button variant="ghost" size="sm" onClick={readAll} disabled={!unread}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <ul className="scroll-thin max-h-[60vh] divide-y divide-border overflow-y-auto">
          {!data && Array.from({ length: 4 }).map((_, i) => <li key={i} className="h-16 animate-pulse bg-surface-2/40" />)}
          {data?.data.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted">You&apos;re all caught up.</li>}
          {data?.data.map((n) => {
            const meta = TYPE_ICON[n.type] ?? TYPE_ICON.ACCOUNT!;
            const Icon = meta.icon;
            return (
              <li key={n.id}>
                <button onClick={() => void open(n)} className={cn("flex w-full gap-3 px-4 py-3 text-left transition hover:bg-surface-2", !n.readAt && "bg-surface-2/50")}>
                  <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", meta.tone)}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-2">
                      <span className={cn("line-clamp-1 flex-1 text-sm", n.readAt ? "text-fg-soft" : "font-medium text-fg")}>{n.title}</span>
                      {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-info" />}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.message}</span>
                    <span className="mt-1 block text-[11px] text-muted/80">{timeAgo(n.sentAt ?? n.scheduledAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------- user menu

export function UserMenu() {
  const session = useSession();
  const router = useRouter();
  const signOut = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-lg p-0.5 outline-none ring-ring/40 focus-visible:ring-2" aria-label="Account menu">
          <Avatar name={session.fullName} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <Avatar name={session.fullName} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{session.fullName}</p>
            <p className="truncate text-xs text-muted">{session.email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{ROLE_LABEL[session.role]}</DropdownMenuLabel>
        {session.clinicStatus && <p className="px-2.5 pb-1 text-xs text-muted">Clinic: {session.clinicStatus.toLowerCase()}</p>}
        {session.organizationStatus && <p className="px-2.5 pb-1 text-xs text-muted">Organisation: {session.organizationStatus.toLowerCase()}</p>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/app/settings")}>
          <UserCog /> Settings & profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
