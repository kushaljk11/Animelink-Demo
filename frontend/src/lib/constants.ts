// Client-safe mirrors of the Prisma enums (importing @prisma/client in the
// browser would pull the engine), plus UI labels and status tones.

export type Role = "ADMIN" | "PET_OWNER" | "VET_CLINIC" | "RESCUE_ORG" | "WARD_OFFICER";
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrator",
  WARD_OFFICER: "Ward Officer",
  PET_OWNER: "Pet Owner",
  VET_CLINIC: "Veterinary Clinic",
  RESCUE_ORG: "Rescue Organisation",
};

export const SPECIES = ["DOG", "CAT", "OTHER"] as const;
export const GENDERS = ["MALE", "FEMALE", "UNKNOWN"] as const;
export const ANIMAL_TYPES = ["DOG", "CAT", "MONKEY", "JACKAL", "MONGOOSE", "LIVESTOCK", "OTHER"] as const;
export const SEVERITIES = ["LOW", "MODERATE", "HIGH"] as const;
export const INCIDENT_STATUSES = ["REPORTED", "UNDER_REVIEW", "VERIFIED", "RESOLVED", "DISMISSED"] as const;
export const VACCINATION_STATUSES = ["PENDING_VERIFICATION", "VERIFIED", "REVOKED"] as const;
export const BOOSTER_STATUSES = ["UP_TO_DATE", "DUE_SOON", "OVERDUE", "NO_BOOSTER"] as const;
export const VERIFICATION_STATUSES = ["PENDING", "VERIFIED", "REJECTED", "SUSPENDED"] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** Mirrors INCIDENT_TRANSITIONS in src/lib/validators (server is the authority). */
export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  REPORTED: ["UNDER_REVIEW", "VERIFIED", "DISMISSED"],
  UNDER_REVIEW: ["VERIFIED", "DISMISSED", "RESOLVED"],
  VERIFIED: ["RESOLVED", "UNDER_REVIEW"],
  RESOLVED: ["UNDER_REVIEW"],
  DISMISSED: ["UNDER_REVIEW"],
};

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "violet";

/** Status → tone. `live` statuses get the pulsing dot (needs attention). */
export const STATUS_TONE: Record<string, { tone: Tone; live?: boolean; label?: string }> = {
  REPORTED: { tone: "info", live: true },
  UNDER_REVIEW: { tone: "warning", live: true, label: "Under review" },
  VERIFIED: { tone: "success" },
  RESOLVED: { tone: "neutral" },
  DISMISSED: { tone: "neutral" },
  PENDING_VERIFICATION: { tone: "warning", live: true, label: "Pending" },
  REVOKED: { tone: "danger" },
  PENDING: { tone: "warning", live: true },
  REJECTED: { tone: "danger" },
  SUSPENDED: { tone: "danger" },
  UP_TO_DATE: { tone: "success", label: "Up to date" },
  DUE_SOON: { tone: "warning", live: true, label: "Due soon" },
  OVERDUE: { tone: "danger", live: true },
  NO_BOOSTER: { tone: "neutral", label: "No booster" },
  NOT_VACCINATED: { tone: "danger", label: "Not vaccinated" },
  ACTIVE: { tone: "danger", live: true, label: "Lost" },
  FOUND: { tone: "success" },
  CANCELLED: { tone: "neutral" },
  LOW: { tone: "neutral" },
  MODERATE: { tone: "warning" },
  HIGH: { tone: "danger" },
  LIKELY: { tone: "danger" },
  POSSIBLE: { tone: "warning" },
};

export const TONE_CLASSES: Record<Tone, { pill: string; dot: string; text: string }> = {
  neutral: { pill: "bg-surface-3 text-fg-soft ring-border-strong/60", dot: "bg-muted text-muted", text: "text-muted" },
  info: { pill: "bg-info/10 text-info ring-info/25", dot: "bg-info text-info", text: "text-info" },
  success: { pill: "bg-success/10 text-success ring-success/25", dot: "bg-success text-success", text: "text-success" },
  warning: { pill: "bg-warning/10 text-warning ring-warning/25", dot: "bg-warning text-warning", text: "text-warning" },
  danger: { pill: "bg-danger/10 text-danger ring-danger/25", dot: "bg-danger text-danger", text: "text-danger" },
  violet: { pill: "bg-violet/10 text-violet ring-violet/25", dot: "bg-violet text-violet", text: "text-violet" },
};

export const options = (values: readonly string[], labels?: Record<string, string>) =>
  values.map((v) => ({
    value: v,
    label: labels?.[v] ?? STATUS_TONE[v]?.label ?? v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " "),
  }));
