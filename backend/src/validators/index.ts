// Zod schemas for every incoming body / query in the API (Section L requirements).
import {
  AnimalType,
  Gender,
  IncidentStatus,
  Locale,
  LostReportStatus,
  Role,
  Severity,
  Species,
  VerificationStatus,
} from "@prisma/client";
import { z } from "zod";

// ================================================================ primitives

/** Prototype operates inside Nepal (Section J); coordinates outside are rejected. */
export const NEPAL_BOUNDS = { minLat: 26.3, maxLat: 30.5, minLng: 80.0, maxLng: 88.3 } as const;

export const latitude = z.coerce
  .number({ invalid_type_error: "Latitude must be a number" })
  .min(NEPAL_BOUNDS.minLat, "Latitude is outside Nepal")
  .max(NEPAL_BOUNDS.maxLat, "Latitude is outside Nepal");
export const longitude = z.coerce
  .number({ invalid_type_error: "Longitude must be a number" })
  .min(NEPAL_BOUNDS.minLng, "Longitude is outside Nepal")
  .max(NEPAL_BOUNDS.maxLng, "Longitude is outside Nepal");

export const id = z.string().trim().min(1).max(40);
const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v));

/** Nepali mobile (98/97/96xxxxxxxx) or landline (01-xxxxxxx), optional +977 prefix. */
export const phone = z
  .string()
  .trim()
  .regex(/^(\+?977[-\s]?)?(9[678]\d{8}|0\d{1,2}-?\d{6,7})$/, "Enter a valid Nepali mobile or landline number");

/** Citizen mobile for public submissions: 10 digits starting 98/97; tolerates +977, spaces and dashes; stored as 98XXXXXXXX. */
export const nepaliMobile = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+?977/, ""))
  .pipe(z.string().regex(/^9[78]\d{8}$/, "Enter a 10-digit Nepali mobile number (98XXXXXXXX)"));

export const email = z.string().trim().toLowerCase().email().max(120);

export const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-z]/, "Password needs a lowercase letter")
  .regex(/[A-Z]/, "Password needs an uppercase letter")
  .regex(/\d/, "Password needs a number");

export const wardNumber = z.coerce.number().int().min(1).max(35);
export const municipality = trimmed(2, 80);

const pastDate = (label: string) =>
  z.coerce.date({ invalid_type_error: `${label} must be a date` }).refine((d) => d.getTime() <= Date.now() + 60_000, {
    message: `${label} cannot be in the future`,
  });

/** Only server-issued upload paths may be referenced (prevents hot-linking arbitrary URLs). */
export const uploadUrl = (kind?: "pets" | "incidents" | "strays" | "breed") =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^/uploads/${kind ?? "(pets|incidents|strays|breed|seed)"}/[A-Za-z0-9_-]+\\.(webp|png|jpe?g|svg)$`),
      "Upload the image first and use the returned url",
    );

const pairCheck = (latKey: string, lngKey: string) => (v: Record<string, unknown>) =>
  (v[latKey] == null) === (v[lngKey] == null);
const pairMessage = (latKey: string) => ({ message: "Latitude and longitude must be provided together", path: [latKey] });

// ===================================================================== auth

export const SELF_REGISTER_ROLES = [Role.PET_OWNER, Role.VET_CLINIC, Role.RESCUE_ORG] as const;

const clinicProfile = z.object({
  clinicName: trimmed(3, 120),
  registrationNumber: trimmed(3, 40),
  phone,
  address: trimmed(3, 200),
  latitude,
  longitude,
  wardNumber: wardNumber.optional(),
  municipality: municipality.optional(),
  openingHours: optionalText(120),
  serviceRadiusKm: z.coerce.number().min(0.5).max(50).optional(),
});

const organizationProfile = z.object({
  organizationName: trimmed(3, 120),
  phone,
  address: trimmed(3, 200),
  latitude,
  longitude,
  wardNumber: wardNumber.optional(),
  municipality: municipality.optional(),
  hasShelter: z.boolean().optional(),
  serviceRadiusKm: z.coerce.number().min(0.5).max(50).optional(),
});

export const registerSchema = z
  .object({
    fullName: trimmed(2, 100),
    email,
    phone: phone.optional(),
    password,
    role: z.enum(SELF_REGISTER_ROLES).default(Role.PET_OWNER),
    wardNumber: wardNumber.optional(),
    municipality: municipality.optional(),
    locale: z.nativeEnum(Locale).optional(),
    clinic: clinicProfile.optional(),
    organization: organizationProfile.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === Role.VET_CLINIC && !v.clinic) {
      ctx.addIssue({ code: "custom", path: ["clinic"], message: "Clinic details are required for vet accounts" });
    }
    if (v.role === Role.RESCUE_ORG && !v.organization) {
      ctx.addIssue({
        code: "custom",
        path: ["organization"],
        message: "Organisation details are required for rescue accounts",
      });
    }
  });

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });

export const updateProfileSchema = z
  .object({
    fullName: trimmed(2, 100),
    phone: phone.nullable(),
    wardNumber: wardNumber.nullable(),
    municipality: municipality.nullable(),
    locale: z.nativeEnum(Locale),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: password })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must differ from the current one",
    path: ["newPassword"],
  });

export const switchRoleSchema = z.object({ role: z.nativeEnum(Role) });

// ==================================================================== users

export const adminCreateUserSchema = z.object({
  fullName: trimmed(2, 100),
  email,
  phone: phone.optional(),
  password,
  role: z.nativeEnum(Role),
  wardNumber: wardNumber.optional(),
  municipality: municipality.optional(),
  locale: z.nativeEnum(Locale).optional(),
});

export const adminUpdateUserSchema = z
  .object({
    fullName: trimmed(2, 100),
    phone: phone.nullable(),
    role: z.nativeEnum(Role),
    wardNumber: wardNumber.nullable(),
    municipality: municipality.nullable(),
    locale: z.nativeEnum(Locale),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" });

// ===================================================================== pets

export const petCreateSchema = z.object({
  name: trimmed(1, 60),
  species: z.nativeEnum(Species),
  breed: optionalText(80),
  gender: z.nativeEnum(Gender).default(Gender.UNKNOWN),
  dateOfBirth: pastDate("Date of birth").optional().nullable(),
  color: optionalText(60),
  photoUrl: uploadUrl().optional().nullable(),
  medicalNotes: optionalText(2000),
  breedPredictionId: id.optional(), // links an AI suggestion run before the pet existed
});

export const petUpdateSchema = petCreateSchema
  .omit({ breedPredictionId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" });

/** Vets may update medical information only (Section K.2). */
export const petMedicalUpdateSchema = z.object({ medicalNotes: optionalText(2000) });

export const markLostSchema = z
  .object({
    lastSeenDate: pastDate("Last seen date"),
    lastSeenLatitude: latitude.optional().nullable(),
    lastSeenLongitude: longitude.optional().nullable(),
    description: optionalText(1000),
  })
  .refine(pairCheck("lastSeenLatitude", "lastSeenLongitude"), pairMessage("lastSeenLatitude"));

export const markFoundSchema = z.object({ note: optionalText(500) });

export const lostReportUpdateSchema = z
  .object({
    lastSeenDate: pastDate("Last seen date"),
    lastSeenLatitude: latitude.nullable(),
    lastSeenLongitude: longitude.nullable(),
    description: optionalText(1000),
    status: z.nativeEnum(LostReportStatus),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" })
  .refine((v) => (v.lastSeenLatitude === undefined) === (v.lastSeenLongitude === undefined), {
    message: "Latitude and longitude must be updated together",
    path: ["lastSeenLatitude"],
  });

// ============================================================== public QR

export const qrScanSchema = z
  .object({
    shareLocation: z.boolean().default(false),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    message: optionalText(500),
    contact: optionalText(80),
  })
  .refine((v) => !v.shareLocation || (v.latitude != null && v.longitude != null), {
    message: "Location coordinates are required when sharing location",
    path: ["latitude"],
  });

// ============================================================ vaccinations

const vaccinationBase = z.object({
  vaccineName: trimmed(2, 80),
  batchNumber: trimmed(2, 40),
  administeredDate: pastDate("Administered date"),
  boosterDueDate: z.coerce.date().optional().nullable(),
  notes: optionalText(1000),
});

const boosterCheck = (v: { administeredDate?: Date; boosterDueDate?: Date | null }) =>
  !v.administeredDate || !v.boosterDueDate || v.boosterDueDate > v.administeredDate;
const boosterMessage = { message: "Booster due date must be after the administered date", path: ["boosterDueDate"] };

export const vaccinationCreateSchema = vaccinationBase
  .extend({
    petId: id,
    /** Required when a pet owner submits a paper record for a clinic to verify. Ignored for vets. */
    clinicId: id.optional(),
    /** Vets may verify immediately on creation. */
    verify: z.boolean().default(false),
  })
  .refine(boosterCheck, boosterMessage);

export const vaccinationUpdateSchema = vaccinationBase
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" })
  .refine(boosterCheck, boosterMessage);

export const vaccinationDecisionSchema = z.object({
  decision: z.enum(["VERIFY", "REVOKE"]),
  notes: optionalText(500),
});

// =================================================== clinics / organisations

export const clinicCreateSchema = clinicProfile.extend({ userId: id.optional() });
export const clinicUpdateSchema = clinicProfile
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: "Latitude and longitude must be updated together",
    path: ["latitude"],
  });

export const organizationCreateSchema = organizationProfile.extend({ userId: id.optional() });
export const organizationUpdateSchema = organizationProfile
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: "Latitude and longitude must be updated together",
    path: ["latitude"],
  });

export const verificationDecisionSchema = z.object({
  status: z.nativeEnum(VerificationStatus).refine((s) => s !== VerificationStatus.PENDING, {
    message: "Choose VERIFIED, REJECTED or SUSPENDED",
  }),
  note: optionalText(500),
});

// ================================================================== strays

const strayBase = z.object({
  tagOrEarMark: optionalText(60),
  species: z.nativeEnum(Species).default(Species.DOG),
  gender: z.nativeEnum(Gender).default(Gender.UNKNOWN),
  estimatedAge: optionalText(40),
  color: optionalText(60),
  breed: optionalText(80),
  physicalDescription: optionalText(1000),
  photoUrl: uploadUrl().optional().nullable(),
  latitude,
  longitude,
  address: optionalText(200),
  wardNumber: wardNumber.optional().nullable(),
  municipality: municipality.optional().nullable(),
});

export const strayCreateSchema = strayBase.extend({
  /** Set after the user has reviewed duplicate candidates and decided this is a new animal. */
  acknowledgeDuplicates: z.boolean().default(false),
});

export const strayUpdateSchema = strayBase
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: "Latitude and longitude must be updated together",
    path: ["latitude"],
  });

export const duplicateCheckSchema = strayBase
  .pick({
    tagOrEarMark: true,
    species: true,
    gender: true,
    color: true,
    breed: true,
    physicalDescription: true,
    photoUrl: true,
    latitude: true,
    longitude: true,
  })
  .extend({
    radiusKm: z.coerce.number().min(0.1).max(10).default(2),
    excludeId: id.optional(),
  });

// ==================================================================== CNVR

const cnvrBase = z.object({
  vaccineName: optionalText(80),
  vaccinationDate: pastDate("Vaccination date").optional().nullable(),
  sterilizationDate: pastDate("Sterilization date").optional().nullable(),
  releaseLatitude: latitude.optional().nullable(),
  releaseLongitude: longitude.optional().nullable(),
  releaseDate: pastDate("Release date").optional().nullable(),
  notes: optionalText(2000),
});

export const cnvrCreateSchema = cnvrBase
  .extend({ strayId: id })
  .refine(pairCheck("releaseLatitude", "releaseLongitude"), pairMessage("releaseLatitude"))
  .refine((v) => v.vaccinationDate || v.sterilizationDate || v.releaseDate, {
    message: "Record at least one of vaccination, sterilization or release",
    path: ["vaccinationDate"],
  })
  .refine((v) => !v.vaccinationDate || !!v.vaccineName, {
    message: "Vaccine name is required when a vaccination date is recorded",
    path: ["vaccineName"],
  });

export const cnvrUpdateSchema = cnvrBase
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" })
  .refine((v) => (v.releaseLatitude === undefined) === (v.releaseLongitude === undefined), {
    message: "Release latitude and longitude must be updated together",
    path: ["releaseLatitude"],
  });

// =============================================================== incidents

const incidentBase = z.object({
  animalType: z.nativeEnum(AnimalType),
  severity: z.nativeEnum(Severity),
  description: trimmed(10, 2000),
  incidentDate: pastDate("Incident date").refine((d) => d.getTime() > Date.now() - 366 * 86_400_000, {
    message: "Incident date must be within the last year",
  }),
  suspectedRabies: z.boolean().default(false),
  photoUrl: uploadUrl("incidents").optional().nullable(),
  latitude,
  longitude,
  locationAccuracyM: z.coerce.number().min(0).max(50_000).optional().nullable(),
  address: optionalText(200),
  wardNumber: wardNumber.optional().nullable(),
  municipality: municipality.optional().nullable(),
});

export const incidentCreateSchema = incidentBase.extend({
  reporterName: optionalText(100),
  reporterPhone: z.preprocess((v) => (v === "" ? null : v), nepaliMobile.nullable().optional()),
});

export const incidentUpdateSchema = incidentBase
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: "Latitude and longitude must be updated together",
    path: ["latitude"],
  });

/** Assign the responsible ward officer (null = unassign). */
export const incidentAssignSchema = z.object({
  handledById: z.string().trim().min(1, "Choose an officer").nullable(),
  note: optionalText(500),
});

export const incidentReleaseSchema = z.object({ note: optionalText(500) });

export const incidentStatusSchema = z.object({
  status: z.nativeEnum(IncidentStatus),
  note: optionalText(1000),
});

/** Allowed incident lifecycle transitions (Section K.4 "update or manage incident status"). */
export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  REPORTED: ["UNDER_REVIEW", "VERIFIED", "DISMISSED"],
  UNDER_REVIEW: ["VERIFIED", "DISMISSED", "RESOLVED"],
  VERIFIED: ["RESOLVED", "UNDER_REVIEW"],
  RESOLVED: ["UNDER_REVIEW"],
  DISMISSED: ["UNDER_REVIEW"],
};

// =========================================================== notifications

export const notificationUpdateSchema = z.object({ read: z.boolean() });

// ==================================================================== chat

export const conversationCreateSchema = z.object({
  clinicId: id,
  petId: id.optional().nullable(),
  subject: optionalText(120),
  message: trimmed(1, 2000),
});

export const messageCreateSchema = z.object({ body: trimmed(1, 2000) });

// ====================================================================== AI

export const breedConfirmSchema = z
  .object({
    confirmed: z.boolean(),
    finalBreed: optionalText(80),
    petId: id.optional(),
  })
  .refine((v) => v.confirmed || !!v.finalBreed, {
    message: "Provide the correct breed when rejecting the suggestion",
    path: ["finalBreed"],
  });

export const chatbotSchema = z.object({
  message: trimmed(1, 1000),
  sessionKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{8,64}$/)
    .optional(),
  locale: z.nativeEnum(Locale).optional(),
});

export const chatbotFeedbackSchema = z.object({ helpful: z.boolean() });

// ===================================================================== geo

const csvOf = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s) return [...values];
      const parts = s
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const bad = parts.filter((p) => !values.includes(p as T));
      if (bad.length) {
        ctx.addIssue({ code: "custom", message: `Unknown value(s): ${bad.join(", ")}. Allowed: ${values.join(", ")}` });
        return z.NEVER;
      }
      return parts as T[];
    });

export const NEARBY_TYPES = ["clinic", "shelter"] as const;
export const trackQuerySchema = z.object({ query: z.string().trim().min(4, "Enter a tracking code or mobile number").max(40) });
export const otpRequestSchema = z.object({ phone: nepaliMobile });
export const INQUIRY_TOPICS = ["GENERAL", "REPORT_HELP", "PARTNERSHIP", "DATA_REQUEST", "TECHNICAL"] as const;
export const inquiryCreateSchema = z.object({
  name: trimmed(2, 100),
  phone: nepaliMobile,
  email: z.preprocess((v) => (v === "" ? null : v), email.nullable().optional()),
  topic: z.enum(INQUIRY_TOPICS),
  message: trimmed(10, 2000),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code sent to your phone"),
});
export const inquiryStatusSchema = z.object({ status: z.enum(["NEW", "RESOLVED"]) });

export const reverseQuerySchema = z.object({ lat: latitude, lng: longitude });
export const placeSearchSchema = z.object({ q: z.string().trim().max(80).default(""), lookup: z.enum(["true", "false"]).default("false").transform((x) => x === "true") });

export const nearbyQuerySchema = z.object({
  lat: latitude,
  lng: longitude,
  radiusKm: z.coerce.number().min(0.1).max(50).default(5),
  types: csvOf(NEARBY_TYPES),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  verifiedOnly: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export const WITHIN_LAYERS = ["incidents", "strays", "cnvr", "clinics", "shelters", "lost"] as const;
export const withinQuerySchema = z.object({
  layer: z.enum(WITHIN_LAYERS),
  lat: latitude,
  lng: longitude,
  radiusKm: z.coerce.number().min(0.1).max(50).default(2),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const clusterQuerySchema = z.object({
  epsKm: z.coerce.number().min(0.05).max(5).default(0.6),
  minPts: z.coerce.number().int().min(2).max(50).default(3),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  suspectedOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  municipality: municipality.optional(),
  wardNumber: wardNumber.optional(),
});

export const riskQuerySchema = z.object({
  cellKm: z.coerce.number().min(0.25).max(5).default(1),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  municipality: municipality.optional(),
});

export const MAP_LAYERS = ["incidents", "strays", "cnvr", "clinics", "shelters", "lost"] as const;
export const mapQuerySchema = z.object({
  layers: csvOf(MAP_LAYERS),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  municipality: municipality.optional(),
  wardNumber: wardNumber.optional(),
  minLat: latitude.optional(),
  maxLat: latitude.optional(),
  minLng: longitude.optional(),
  maxLng: longitude.optional(),
});

// ================================================================= reports

export const EXPORT_ENTITIES = ["incidents", "vaccinations", "cnvr", "strays", "pets", "clinics", "organizations"] as const;
export const exportQuerySchema = z.object({
  entity: z.enum(EXPORT_ENTITIES),
  format: z.enum(["csv", "pdf"]).default("csv"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.string().max(200).optional(),
  municipality: municipality.optional(),
  wardNumber: wardNumber.optional(),
});

export const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
  municipality: municipality.optional(),
});

export const searchQuerySchema = z.object({
  q: trimmed(1, 80),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});

export const UPLOAD_KINDS = ["pets", "incidents", "strays", "breed"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];
export const uploadKindSchema = z.enum(UPLOAD_KINDS);
