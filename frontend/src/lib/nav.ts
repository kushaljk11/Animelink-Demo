import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  ClipboardList,
  Dog,
  FileDown,
  HeartHandshake,
  Inbox,
  LayoutDashboard,
  Map,
  MessageSquare,
  PawPrint,
  Settings,
  ScrollText,
  ShieldAlert,
  Stethoscope,
  Syringe,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./constants";

export type BadgeKey = "openIncidents" | "pendingVaccinations" | "pendingVerifications" | "lostPets" | "overdueBoosters" | "unreadMessages";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: Role[];
  badge?: BadgeKey;
  /** Shown only to these roles under a different label (e.g. "My reports"). */
  labelFor?: Partial<Record<Role, string>>;
};

export type NavGroup = { id: string; label: string; icon: LucideIcon; items: NavItem[] };

const ALL: Role[] = ["ADMIN", "WARD_OFFICER", "PET_OWNER", "VET_CLINIC", "RESCUE_ORG"];

export const NAV: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    items: [
      { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard, roles: ALL },
      { label: "Surveillance map", href: "/app/map", icon: Map, roles: ALL, labelFor: { PET_OWNER: "Map", VET_CLINIC: "Map" } },
    ],
  },
  {
    id: "surveillance",
    label: "Surveillance",
    icon: ShieldAlert,
    items: [
      {
        label: "Bite incidents",
        href: "/app/incidents",
        icon: Activity,
        roles: ALL,
        badge: "openIncidents",
        labelFor: { PET_OWNER: "My reports", VET_CLINIC: "My reports" },
      },
    ],
  },
  {
    id: "pets",
    label: "Pet health",
    icon: PawPrint,
    items: [
      { label: "Pets", href: "/app/pets", icon: PawPrint, roles: ["ADMIN", "PET_OWNER", "VET_CLINIC"], badge: "lostPets", labelFor: { PET_OWNER: "My pets", VET_CLINIC: "Patients" } },
      { label: "Vaccinations", href: "/app/vaccinations", icon: Syringe, roles: ["ADMIN", "PET_OWNER", "VET_CLINIC", "WARD_OFFICER"], badge: "pendingVaccinations" },
    ],
  },
  {
    id: "community",
    label: "Community animals",
    icon: Dog,
    items: [
      { label: "Strays", href: "/app/strays", icon: Dog, roles: ["ADMIN", "RESCUE_ORG", "WARD_OFFICER", "VET_CLINIC"] },
      { label: "CNVR records", href: "/app/cnvr", icon: HeartHandshake, roles: ["ADMIN", "RESCUE_ORG", "WARD_OFFICER", "VET_CLINIC"] },
    ],
  },
  {
    id: "directory",
    label: "Directory",
    icon: Building2,
    items: [
      { label: "Clinics", href: "/app/clinics", icon: Stethoscope, roles: ALL, badge: "pendingVerifications" },
      { label: "Rescue orgs", href: "/app/organizations", icon: Building2, roles: ALL },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    icon: BarChart3,
    items: [
      { label: "Reports & export", href: "/app/reports", icon: FileDown, roles: ["ADMIN", "WARD_OFFICER", "VET_CLINIC", "RESCUE_ORG"] },
      { label: "Users", href: "/app/users", icon: Users, roles: ["ADMIN"] },
      { label: "Audit log", href: "/app/audit", icon: ScrollText, roles: ["ADMIN", "WARD_OFFICER"] },
      { label: "Inquiries", href: "/app/inquiries", icon: Inbox, roles: ["ADMIN"] },
    ],
  },
  {
    id: "help",
    label: "Help & account",
    icon: Bot,
    items: [
      { label: "Messages", href: "/app/chat", icon: MessageSquare, roles: ["PET_OWNER", "VET_CLINIC"], badge: "unreadMessages", labelFor: { PET_OWNER: "Message a vet", VET_CLINIC: "Owner messages" } },
      { label: "AI assistant", href: "/app/assistant", icon: Bot, roles: ALL },
      { label: "Settings", href: "/app/settings", icon: Settings, roles: ALL },
    ],
  },
];

/** Items visible to a role, with role-specific labels; `tr` translates labels (e.g. to Nepali). */
export function navFor(role: Role, tr: (label: string) => string = (l) => l): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    label: tr(g.label),
    items: g.items
      .filter((i) => !i.roles || role === "ADMIN" || i.roles.includes(role))
      .map((i) => ({ ...i, label: tr(i.labelFor?.[role] ?? i.label) })),
  })).filter((g) => g.items.length > 0);
}

export const PUBLIC_LINKS = [
  { label: "Report an incident", href: "/submit", icon: ShieldAlert },
  { label: "Track a report", href: "/track", icon: ClipboardList },
  { label: "Nearby vets & shelters", href: "/nearby", icon: Stethoscope },
  { label: "Lost pets", href: "/lost", icon: PawPrint },
];
