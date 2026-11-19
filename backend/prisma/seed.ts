/* eslint-disable no-console */
// Rabies Track Nepal — deterministic local seed (Kathmandu Valley test region).
//
//   npm run db:seed      (wipes every table, then rebuilds ≥20 rows per table)
//
// Same PRNG seed → same data on every machine. All timestamps are relative to
// "now" so dashboards always show a populated last-30-days window.
import {
  AnimalType,
  Gender,
  IncidentStatus,
  LostReportStatus,
  NotificationStatus,
  NotificationType,
  PrismaClient,
  Role,
  Severity,
  Species,
  VaccinationRecordStatus,
  VerificationStatus,
  type User,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { reply, scrubPii } from "../src/services/ai/chatbot";

const prisma = new PrismaClient();
const NOW = Date.now();
const DAY = 86_400_000;
const HOUR = 3_600_000;

// ----------------------------------------------------------- PRNG utils ---

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261109);
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const chance = (p: number) => rand() < p;
const daysAgo = (d: number, jitterHours = 0) => new Date(NOW - d * DAY - (jitterHours ? int(0, jitterHours) * HOUR : 0));
const token = () => randomBytes(16).toString("base64url");

/** Random point within `radiusM` metres of a centre (uniform over the disc). */
function jitter(lat: number, lng: number, radiusM: number) {
  const r = radiusM * Math.sqrt(rand());
  const theta = rand() * 2 * Math.PI;
  const dLat = (r * Math.cos(theta)) / 111_320;
  const dLng = (r * Math.sin(theta)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: Math.round((lat + dLat) * 1e6) / 1e6, lng: Math.round((lng + dLng) * 1e6) / 1e6 };
}

// ----------------------------------------------------------- reference ---

const KMC = "Kathmandu Metropolitan City";
const LMC = "Lalitpur Metropolitan City";
const BKT = "Bhaktapur Municipality";

type Locality = { name: string; landmark: string; lat: number; lng: number; municipality: string; ward: number };
const LOCALITIES: Locality[] = [
  { name: "Kalanki", landmark: "Kalanki Chowk", lat: 27.6935, lng: 85.2817, municipality: KMC, ward: 14 },
  { name: "Koteshwor", landmark: "Koteshwor Mahadevsthan", lat: 27.6789, lng: 85.3494, municipality: KMC, ward: 32 },
  { name: "Baneshwor", landmark: "New Baneshwor Chowk", lat: 27.6915, lng: 85.342, municipality: KMC, ward: 10 },
  { name: "Thamel", landmark: "Thamel Chowk", lat: 27.7154, lng: 85.3123, municipality: KMC, ward: 26 },
  { name: "Chabahil", landmark: "Chabahil Ganesh Mandir", lat: 27.7172, lng: 85.3466, municipality: KMC, ward: 7 },
  { name: "Maharajgunj", landmark: "Maharajgunj Chakrapath", lat: 27.7369, lng: 85.3304, municipality: KMC, ward: 3 },
  { name: "Balaju", landmark: "Balaju Bypass", lat: 27.7343, lng: 85.3039, municipality: KMC, ward: 16 },
  { name: "Swayambhu", landmark: "Swayambhu Stupa east gate", lat: 27.7149, lng: 85.2904, municipality: KMC, ward: 15 },
  { name: "Teku", landmark: "Teku Dovan", lat: 27.696, lng: 85.3058, municipality: KMC, ward: 12 },
  { name: "Boudha", landmark: "Boudhanath Stupa", lat: 27.7215, lng: 85.362, municipality: KMC, ward: 6 },
  { name: "Baluwatar", landmark: "Baluwatar Chowk", lat: 27.7286, lng: 85.3312, municipality: KMC, ward: 4 },
  { name: "Kalimati", landmark: "Kalimati Vegetable Market", lat: 27.6984, lng: 85.2988, municipality: KMC, ward: 13 },
  { name: "New Road", landmark: "New Road Gate", lat: 27.7041, lng: 85.3076, municipality: KMC, ward: 22 },
  { name: "Pulchowk", landmark: "Pulchowk Campus gate", lat: 27.6781, lng: 85.3172, municipality: LMC, ward: 3 },
  { name: "Jawalakhel", landmark: "Jawalakhel Chowk", lat: 27.6727, lng: 85.3131, municipality: LMC, ward: 4 },
  { name: "Patan", landmark: "Mangal Bazaar, Patan Durbar Square", lat: 27.6726, lng: 85.325, municipality: LMC, ward: 16 },
  { name: "Kupondole", landmark: "Kupondole Height", lat: 27.6857, lng: 85.3175, municipality: LMC, ward: 1 },
  { name: "Satdobato", landmark: "Satdobato Chowk", lat: 27.6588, lng: 85.3247, municipality: LMC, ward: 15 },
  { name: "Lagankhel", landmark: "Lagankhel Bus Park", lat: 27.6667, lng: 85.3236, municipality: LMC, ward: 5 },
  { name: "Sanepa", landmark: "Sanepa Chowk", lat: 27.6847, lng: 85.3053, municipality: LMC, ward: 2 },
  { name: "Bhaktapur Durbar", landmark: "Taumadhi Square", lat: 27.6716, lng: 85.4293, municipality: BKT, ward: 7 },
  { name: "Kamalbinayak", landmark: "Kamalbinayak Bus Park", lat: 27.678, lng: 85.437, municipality: BKT, ward: 2 },
  { name: "Dudhpati", landmark: "Dudhpati Chowk", lat: 27.6735, lng: 85.423, municipality: BKT, ward: 9 },
  { name: "Sallaghari", landmark: "Sallaghari Chowk", lat: 27.671, lng: 85.415, municipality: BKT, ward: 10 },
];
const loc = (name: string) => LOCALITIES.find((l) => l.name === name)!;

const FIRST = ["Aarav", "Sita", "Ramesh", "Gita", "Bikash", "Anjali", "Suman", "Pratima", "Rohan", "Nisha", "Sanjay", "Kabita", "Dipesh", "Sunita", "Prakash", "Manisha", "Rajan", "Bina", "Nabin", "Sarita", "Kiran", "Asmita", "Bibek", "Pooja", "Ujjwal", "Srijana", "Hari", "Laxmi", "Dinesh", "Rekha", "Saroj", "Mina", "Anil", "Shanti", "Roshan", "Kamala", "Sujan", "Rita", "Ashish", "Sabina"];
const LAST = ["Shrestha", "Maharjan", "Tamang", "Gurung", "Thapa", "Rai", "Karki", "Adhikari", "Bhattarai", "Pokharel", "Shakya", "Bajracharya", "Magar", "Khadka", "Lama", "Dahal", "Pandey", "Joshi", "Basnet", "Sherpa"];
const phone = () => `${pick(["98", "97"])}${int(41000000, 69999999)}`;

const DOG_BREEDS = ["Local Nepali / Mixed breed", "Local Nepali / Mixed breed", "Local Nepali / Mixed breed", "Labrador Retriever", "German Shepherd", "Japanese Spitz", "Golden Retriever", "Pomeranian", "Lhasa Apso", "Shih Tzu", "Tibetan Mastiff", "Himalayan Sheepdog (Bhote Kukur)", "Siberian Husky", "Pug", "Rottweiler", "Beagle"];
const CAT_BREEDS = ["Domestic Shorthair", "Domestic Shorthair", "Persian", "Siamese", "Himalayan (Colourpoint Persian)"];
const COLORS: Record<string, string> = {
  black: "#1f2937", white: "#e5e7eb", brown: "#7c4a1e", "black and tan": "#3b2a1a", golden: "#c8912e", cream: "#e8d5a8", grey: "#6b7280", tan: "#b07a42", "brown and white": "#8b5a2b", tabby: "#8a7356", "white with black patches": "#d1d5db",
};
const DOG_NAMES = ["Bhalu", "Momo", "Kalu", "Tiger", "Laila", "Jackie", "Rocky", "Lucy", "Simba", "Chiya", "Puku", "Gori", "Sheru", "Bruno", "Daisy", "Coco", "Maya", "Max", "Oscar", "Tommy", "Bella", "Leo", "Kancha", "Seto", "Raja", "Rani", "Dolly", "Zara", "Buddy", "Joey", "Snowy", "Hachi"];
const CAT_NAMES = ["Kali", "Billi", "Mimi", "Luna", "Nemo", "Chhuchhi", "Sugar", "Mishri", "Pumpkin", "Oreo"];

// --------------------------------------------------------- seed images ---

const SEED_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads", "seed");
function avatar(file: string, label: string, bg: string, accent: string) {
  const text = label.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "?";
  const fg = ["#e5e7eb", "#e8d5a8", "#d1d5db"].includes(bg) ? "#111827" : "#ffffff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><rect width="320" height="320" rx="40" fill="url(#g)"/><circle cx="110" cy="96" r="22" fill="${fg}" opacity=".18"/><circle cx="210" cy="96" r="22" fill="${fg}" opacity=".18"/><text x="160" y="190" font-family="Inter,Arial,sans-serif" font-size="120" font-weight="700" fill="${fg}" text-anchor="middle">${text}</text></svg>`;
  fs.writeFileSync(path.join(SEED_DIR, file), svg);
  return `/uploads/seed/${file}`;
}

// ------------------------------------------------------------------ main ---

async function wipe() {
  // Child → parent order respects every foreign key.
  await prisma.chatMessage.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.chatbotLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.aiBreedPrediction.deleteMany();
  await prisma.qrScanEvent.deleteMany();
  await prisma.lostPetReport.deleteMany();
  await prisma.vaccinationRecord.deleteMany();
  await prisma.cnvrRecord.deleteMany();
  await prisma.communityStray.deleteMany();
  await prisma.biteIncident.deleteMany();
  await prisma.pet.deleteMany();
  await prisma.veterinaryClinic.deleteMany();
  await prisma.rescueOrganization.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log("Seeding Rabies Track Nepal (Kathmandu Valley test region)…");
  await wipe();
  fs.rmSync(SEED_DIR, { recursive: true, force: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });

  const [hAdmin, hOperator, hUser, hVet, hRescue, hDefault] = await Promise.all(
    ["Admin@1234", "Operator@1234", "User@1234", "Vet@1234", "Rescue@1234", "Password@123"].map((p) => bcrypt.hash(p, 10)),
  );

  // ------------------------------------------------------------- users ---
  type NewUser = { fullName: string; email: string; role: Role; hash: string; municipality: string | null; ward: number | null; createdDaysAgo: number; locale?: "EN" | "NE" };
  const usedEmails = new Set<string>();
  const personEmail = (first: string, last: string) => {
    let e = `${first}.${last}@example.com`.toLowerCase();
    let n = 2;
    while (usedEmails.has(e)) e = `${first}.${last}${n++}@example.com`.toLowerCase();
    usedEmails.add(e);
    return e;
  };

  const specs: NewUser[] = [
    { fullName: "System Administrator", email: "admin@local.dev", role: Role.ADMIN, hash: hAdmin, municipality: null, ward: null, createdDaysAgo: 400 },
    { fullName: "Sita Maharjan", email: "operator@local.dev", role: Role.WARD_OFFICER, hash: hOperator, municipality: KMC, ward: 14, createdDaysAgo: 380 },
    { fullName: "Aarav Shrestha", email: "user@local.dev", role: Role.PET_OWNER, hash: hUser, municipality: KMC, ward: 10, createdDaysAgo: 420 },
    { fullName: "Dr. Prakash Adhikari", email: "vet@local.dev", role: Role.VET_CLINIC, hash: hVet, municipality: KMC, ward: 10, createdDaysAgo: 500 },
    { fullName: "Kabita Tamang", email: "rescue@local.dev", role: Role.RESCUE_ORG, hash: hRescue, municipality: KMC, ward: 14, createdDaysAgo: 450 },
  ];
  specs.forEach((s) => usedEmails.add(s.email));
  // Additional ward officers: one more for KMC, two Lalitpur, one Bhaktapur.
  for (const [m, w, n] of [[KMC, 32, "Bishnu Karki"], [LMC, 16, "Rekha Bajracharya"], [LMC, 3, "Hari Shakya"], [BKT, 7, "Mina Prajapati"]] as const) {
    const [f, l] = n.split(" ");
    specs.push({ fullName: n, email: personEmail(f!, l!), role: Role.WARD_OFFICER, hash: hDefault, municipality: m, ward: w, createdDaysAgo: int(200, 500) });
  }
  for (let i = 0; i < 24; i++) {
    const f = pick(FIRST);
    const l = pick(LAST);
    const L = pick(LOCALITIES);
    specs.push({ fullName: `${f} ${l}`, email: personEmail(f, l), role: Role.PET_OWNER, hash: hDefault, municipality: L.municipality, ward: L.ward, createdDaysAgo: int(20, 600), locale: chance(0.3) ? "NE" : "EN" });
  }
  for (let i = 0; i < 21; i++) {
    const f = pick(FIRST);
    const l = pick(LAST);
    specs.push({ fullName: `Dr. ${f} ${l}`, email: personEmail(f, l), role: Role.VET_CLINIC, hash: hDefault, municipality: null, ward: null, createdDaysAgo: int(100, 700) });
  }
  for (let i = 0; i < 20; i++) {
    const f = pick(FIRST);
    const l = pick(LAST);
    specs.push({ fullName: `${f} ${l}`, email: personEmail(f, l), role: Role.RESCUE_ORG, hash: hDefault, municipality: null, ward: null, createdDaysAgo: int(100, 700) });
  }

  const users: User[] = [];
  for (const s of specs) {
    users.push(
      await prisma.user.create({
        data: {
          fullName: s.fullName,
          email: s.email,
          phone: phone(),
          passwordHash: s.hash,
          role: s.role,
          municipality: s.municipality,
          wardNumber: s.ward,
          locale: s.locale ?? "EN",
          createdAt: daysAgo(s.createdDaysAgo),
          accounts: {
            create: { provider: "credentials", providerAccountId: s.email, lastLoginAt: chance(0.8) ? daysAgo(int(0, 20), 23) : null },
          },
        },
      }),
    );
  }
  const byRole = (r: Role) => users.filter((u) => u.role === r);
  const admin = users[0]!;
  const operator = users[1]!;
  const demoOwner = users[2]!;
  const demoVet = users[3]!;
  const demoRescue = users[4]!;
  const owners = byRole(Role.PET_OWNER);
  const vetUsers = byRole(Role.VET_CLINIC);
  const rescueUsers = byRole(Role.RESCUE_ORG);
  const officers = byRole(Role.WARD_OFFICER);
  const officerFor = (m: string | null) => officers.find((o) => o.municipality === m) ?? operator;

  // ----------------------------------------------------------- clinics ---
  const CLINICS: [string, string][] = [
    ["Baneshwor Animal Care Clinic", "Baneshwor"], ["Kalanki Pet Hospital", "Kalanki"], ["Thamel Veterinary Centre", "Thamel"],
    ["Koteshwor Companion Animal Clinic", "Koteshwor"], ["Chabahil Vet Point", "Chabahil"], ["Maharajgunj Small Animal Hospital", "Maharajgunj"],
    ["Balaju Pet Clinic", "Balaju"], ["Swayambhu Animal Health Centre", "Swayambhu"], ["Boudha Veterinary Care", "Boudha"],
    ["Baluwatar Pet Wellness Clinic", "Baluwatar"], ["Kalimati Livestock & Pet Clinic", "Kalimati"], ["New Road Vet Clinic", "New Road"],
    ["Pulchowk Animal Hospital", "Pulchowk"], ["Jawalakhel Pet Care Centre", "Jawalakhel"], ["Patan Veterinary Clinic", "Patan"],
    ["Kupondole Companion Vets", "Kupondole"], ["Satdobato Animal Clinic", "Satdobato"], ["Lagankhel Pet Hospital", "Lagankhel"],
    ["Sanepa Vet & Grooming", "Sanepa"], ["Bhaktapur Animal Health Clinic", "Bhaktapur Durbar"], ["Kamalbinayak Veterinary Point", "Kamalbinayak"],
    ["Sallaghari Pet Clinic", "Sallaghari"],
  ];
  const clinicStatus = (i: number): VerificationStatus =>
    i === 0 ? "VERIFIED" : i === 19 ? "PENDING" : i === 20 ? "PENDING" : i === 21 ? "REJECTED" : i === 12 ? "SUSPENDED" : i === 17 ? "PENDING" : "VERIFIED";
  const clinics = [];
  for (let i = 0; i < CLINICS.length; i++) {
    const [name, where] = CLINICS[i]!;
    const L = loc(where);
    const p = jitter(L.lat, L.lng, 300);
    const u = i === 0 ? demoVet : vetUsers[i]!;
    await prisma.user.update({ where: { id: u.id }, data: { municipality: L.municipality, wardNumber: L.ward } });
    clinics.push(
      await prisma.veterinaryClinic.create({
        data: {
          userId: u.id,
          clinicName: name,
          registrationNumber: `NVC-${int(2012, 2023)}-${String(1000 + i * 37).padStart(4, "0")}`,
          phone: chance(0.5) ? `01-${int(4100000, 5999999)}` : phone(),
          address: `${L.landmark}, ${L.name}, ${L.municipality}`,
          wardNumber: L.ward,
          municipality: L.municipality,
          latitude: p.lat,
          longitude: p.lng,
          openingHours: pick(["Sun–Fri 9:00–18:00", "Daily 8:00–20:00", "Sun–Fri 10:00–17:00, Sat emergencies only", "24 hours"]),
          serviceRadiusKm: pick([3, 5, 5, 8]),
          verificationStatus: clinicStatus(i),
          createdAt: daysAgo(int(90, 600)),
        },
      }),
    );
  }
  const verifiedClinics = clinics.filter((c) => c.verificationStatus === "VERIFIED");
  const demoClinic = clinics[0]!;

  // ------------------------------------------------------- organisations ---
  const ORGS: [string, string, boolean][] = [
    ["Bagmati Paws Rescue", "Kalanki", true], ["Kathmandu Street Dog Alliance", "Teku", true], ["Lalitpur Animal Rescue Collective", "Jawalakhel", true],
    ["Bhaktapur Community Dogs Trust", "Bhaktapur Durbar", true], ["Himalayan Strays Network", "Maharajgunj", false], ["Valley CNVR Volunteers", "Baneshwor", false],
    ["Swayambhu Dog & Monkey Welfare", "Swayambhu", true], ["Patan Paws Shelter", "Patan", true], ["Koteshwor Animal Aid", "Koteshwor", false],
    ["Boudha Street Animal Care", "Boudha", true], ["Chabahil Rescue Team", "Chabahil", false], ["Balaju Stray Support", "Balaju", true],
    ["Teku Animal Welfare Group", "Teku", false], ["Sanepa Dog Shelter", "Sanepa", true], ["Satdobato Animal Haven", "Satdobato", true],
    ["Kalanki Rescue Squad", "Kalanki", false], ["Maharajgunj Paws Foundation", "Maharajgunj", true], ["Thamel Street Dog Project", "Thamel", false],
    ["Jawalakhel Animal Friends", "Jawalakhel", false], ["Sallaghari Strays Trust", "Sallaghari", true], ["New Road Animal Helpers", "New Road", false],
  ];
  const orgStatus = (i: number): VerificationStatus => (i === 17 || i === 18 ? "PENDING" : i === 20 ? "REJECTED" : i === 15 ? "SUSPENDED" : "VERIFIED");
  const orgs = [];
  for (let i = 0; i < ORGS.length; i++) {
    const [name, where, shelter] = ORGS[i]!;
    const L = loc(where);
    const p = jitter(L.lat, L.lng, 600);
    const u = i === 0 ? demoRescue : rescueUsers[i]!;
    await prisma.user.update({ where: { id: u.id }, data: { municipality: L.municipality, wardNumber: L.ward } });
    orgs.push(
      await prisma.rescueOrganization.create({
        data: {
          userId: u.id,
          organizationName: name,
          phone: phone(),
          address: `${L.landmark}, ${L.name}, ${L.municipality}`,
          wardNumber: L.ward,
          municipality: L.municipality,
          latitude: p.lat,
          longitude: p.lng,
          hasShelter: shelter,
          serviceRadiusKm: pick([5, 8, 10, 15]),
          verificationStatus: orgStatus(i),
          createdAt: daysAgo(int(120, 900)),
        },
      }),
    );
  }
  const verifiedOrgs = orgs.filter((o) => o.verificationStatus === "VERIFIED");

  // -------------------------------------------------------------- pets ---
  type PetSeed = { ownerIdx: number; name: string; species: Species; breed: string; color: string };
  const petSeeds: PetSeed[] = [
    { ownerIdx: 0, name: "Bhalu", species: "DOG", breed: "Local Nepali / Mixed breed", color: "black" },
    { ownerIdx: 0, name: "Momo", species: "DOG", breed: "Japanese Spitz", color: "white" },
    { ownerIdx: 0, name: "Kali", species: "CAT", breed: "Domestic Shorthair", color: "black" },
  ];
  const usedNames = new Set(["Bhalu", "Momo", "Kali"]);
  for (let i = 0; i < 42; i++) {
    const cat = chance(0.22);
    let name = cat ? pick(CAT_NAMES) : pick(DOG_NAMES);
    let n = 2;
    const base = name;
    while (usedNames.has(name)) name = `${base} ${n++}`;
    usedNames.add(name);
    petSeeds.push({
      ownerIdx: 1 + (i % (owners.length - 1)),
      name,
      species: cat ? "CAT" : "DOG",
      breed: cat ? pick(CAT_BREEDS) : pick(DOG_BREEDS),
      color: pick(cat ? ["black", "white", "grey", "tabby", "cream"] : Object.keys(COLORS).filter((c) => c !== "tabby")),
    });
  }
  const pets = [];
  for (let i = 0; i < petSeeds.length; i++) {
    const s = petSeeds[i]!;
    const owner = owners[s.ownerIdx]!;
    const bg = COLORS[s.color] ?? "#6b7280";
    pets.push(
      await prisma.pet.create({
        data: {
          ownerId: owner.id,
          name: s.name,
          species: s.species,
          breed: s.breed,
          gender: pick([Gender.MALE, Gender.FEMALE, Gender.MALE, Gender.FEMALE, Gender.UNKNOWN]),
          dateOfBirth: daysAgo(int(120, 365 * 11)),
          color: s.color,
          photoUrl: avatar(`pet-${String(i + 1).padStart(2, "0")}.svg`, s.name, bg, s.species === "CAT" ? "#7c3aed" : "#0f766e"),
          medicalNotes: chance(0.35)
            ? pick([
                "Mild skin allergy in monsoon; uses medicated shampoo.",
                "Sterilised in 2024.",
                "Hip dysplasia monitored yearly.",
                "Sensitive stomach — avoid rice-only diet.",
                "Recovered from tick fever (ehrlichiosis) last year.",
                "Deworming every 3 months.",
              ])
            : null,
          qrToken: token(),
          createdAt: new Date(Math.max(owner.createdAt.getTime() + DAY, NOW - int(10, 500) * DAY)),
        },
      }),
    );
  }

  // ------------------------------------------------------ vaccinations ---
  const RABIES = ["Rabisin (Rabies)", "Nobivac Rabies", "Raksharab", "Defensor 3 (Rabies)"];
  const DOG_CORE = ["Nobivac DHPPi", "Vanguard Plus 5/L", "Canigen DHPPi/L"];
  const CAT_CORE = ["Feligen CRP", "Nobivac Tricat Trio"];
  const batch = (prefix: string) => `${prefix}${int(23, 26)}${String.fromCharCode(65 + int(0, 11))}${int(1000, 9999)}`;
  let vaccinationCount = 0;
  const vaccinationRecords: Awaited<ReturnType<typeof prisma.vaccinationRecord.create>>[] = [];
  for (let i = 0; i < pets.length; i++) {
    const pet = pets[i]!;
    // Spread booster states: overdue / due soon / up to date / recent (feeds the 30-day charts).
    const scenario = i === 0 ? "dueSoon" : i === 1 ? "recent" : i === 2 ? "overdue" : pick(["overdue", "dueSoon", "upToDate", "upToDate", "recent", "recent", "none"] as const);
    if (scenario === "none" && i > 5) continue;
    const administeredAgo =
      scenario === "overdue" ? int(372, 470) : scenario === "dueSoon" ? int(338, 360) : scenario === "upToDate" ? int(45, 300) : int(0, 29);
    const clinic = i < 6 ? demoClinic : pick(verifiedClinics);
    const administered = daysAgo(administeredAgo, 8);
    const isLegacyPending = i % 13 === 7;
    const status: VaccinationRecordStatus = isLegacyPending ? "PENDING_VERIFICATION" : i % 17 === 11 ? "REVOKED" : "VERIFIED";
    vaccinationRecords.push(
      await prisma.vaccinationRecord.create({
        data: {
          petId: pet.id,
          vetId: clinic.id,
          recordedById: status === "PENDING_VERIFICATION" ? null : clinic.userId,
          vaccineName: pick(RABIES),
          batchNumber: batch("RB"),
          administeredDate: administered,
          boosterDueDate: new Date(administered.getTime() + 365 * DAY),
          status,
          notes: status === "REVOKED" ? "[revoked] Batch number did not match clinic stock register." : chance(0.2) ? "Mild swelling at injection site, resolved in 24 h." : null,
          verifiedAt: status === "VERIFIED" ? new Date(administered.getTime() + int(0, 6) * HOUR) : status === "REVOKED" ? new Date(administered.getTime() + 2 * HOUR) : null,
          createdAt: administered,
        },
      }),
    );
    vaccinationCount++;
    // Core vaccine alongside rabies for most pets.
    if (chance(0.75)) {
      const coreAdmin = new Date(administered.getTime() - int(0, 1) * 14 * DAY);
      vaccinationRecords.push(
        await prisma.vaccinationRecord.create({
          data: {
            petId: pet.id,
            vetId: clinic.id,
            recordedById: clinic.userId,
            vaccineName: pet.species === "CAT" ? pick(CAT_CORE) : pick(DOG_CORE),
            batchNumber: batch(pet.species === "CAT" ? "FC" : "DH"),
            administeredDate: coreAdmin,
            boosterDueDate: new Date(coreAdmin.getTime() + 365 * DAY),
            status: "VERIFIED",
            verifiedAt: new Date(coreAdmin.getTime() + 3 * HOUR),
            createdAt: coreAdmin,
          },
        }),
      );
      vaccinationCount++;
    }
    // Older history: previous year's rabies shot (superseded) for long-registered pets.
    if (administeredAgo < 300 && chance(0.4)) {
      const prev = new Date(administered.getTime() - 365 * DAY - int(0, 20) * DAY);
      vaccinationRecords.push(
        await prisma.vaccinationRecord.create({
          data: {
            petId: pet.id,
            vetId: pick(verifiedClinics).id,
            vaccineName: pick(RABIES),
            batchNumber: batch("RB"),
            administeredDate: prev,
            boosterDueDate: new Date(prev.getTime() + 365 * DAY),
            status: "VERIFIED",
            verifiedAt: new Date(prev.getTime() + 2 * HOUR),
            createdAt: prev,
          },
        }),
      );
      vaccinationCount++;
    }
  }
  // Owner-submitted paper records waiting at the demo clinic (verification queue).
  for (const pet of pets.slice(3, 9)) {
    const d = daysAgo(int(40, 200));
    vaccinationRecords.push(
      await prisma.vaccinationRecord.create({
        data: {
          petId: pet.id,
          vetId: demoClinic.id,
          vaccineName: pick(RABIES),
          batchNumber: batch("RB"),
          administeredDate: d,
          boosterDueDate: new Date(d.getTime() + 365 * DAY),
          status: "PENDING_VERIFICATION",
          notes: "Submitted by owner from paper vaccination card.",
          createdAt: daysAgo(int(0, 6), 20),
        },
      }),
    );
    vaccinationCount++;
  }

  // ------------------------------------------------------------ strays ---
  const STRAY_DESC = [
    "Medium-sized, notched left ear, limps slightly on right hind leg.",
    "Friendly female, white patch on chest, often near the temple steps.",
    "Large male with thick coat and scar above left eye.",
    "Shy, stays near the vegetable stalls; black tongue spot.",
    "Young dog, curled tail, red collar left by a shopkeeper.",
    "Old female with greying muzzle, nursing pups in the alley.",
    "Short-haired, tan with dark mask, very territorial at night.",
    "Has a small ear tag; follows school children in the morning.",
  ];
  const strayAnchors = ["Kalanki", "Kalanki", "Koteshwor", "Koteshwor", "Patan", "Patan", "Teku", "Swayambhu", "Thamel", "Boudha", "Balaju", "Jawalakhel", "Bhaktapur Durbar", "Kalimati", "Chabahil", "Satdobato"];
  const strays = [];
  for (let i = 0; i < 32; i++) {
    const L = loc(pick(strayAnchors));
    const p = jitter(L.lat, L.lng, 700);
    const color = pick(["brown", "black", "tan", "black and tan", "brown and white", "cream", "white with black patches"]);
    const prefix = L.municipality === KMC ? "KTM" : L.municipality === LMC ? "LTP" : "BKT";
    const registrar = i < 8 ? demoRescue : rescueUsers[orgs.indexOf(pick(verifiedOrgs))] ?? demoRescue;
    strays.push(
      await prisma.communityStray.create({
        data: {
          registeredById: registrar.id,
          tagOrEarMark: chance(0.8) ? `${prefix}-${pick(["E", "N", "T"])}-${String(int(1, 400)).padStart(4, "0")}` : null,
          species: chance(0.94) ? "DOG" : "CAT",
          gender: pick([Gender.MALE, Gender.FEMALE, Gender.FEMALE, Gender.UNKNOWN]),
          estimatedAge: pick(["~6 months", "~1 year", "~2 years", "~3 years", "4-5 years", "older (7+ years)"]),
          color,
          breed: "Local Nepali / Mixed breed",
          physicalDescription: pick(STRAY_DESC),
          photoUrl: avatar(`stray-${String(i + 1).padStart(2, "0")}.svg`, `S${i + 1}`, COLORS[color] ?? "#6b7280", "#334155"),
          latitude: p.lat,
          longitude: p.lng,
          address: `Near ${L.landmark}`,
          wardNumber: L.ward,
          municipality: L.municipality,
          createdAt: daysAgo(i < 18 ? int(0, 29) : int(30, 300), 20),
        },
      }),
    );
  }
  // Two records that look like the same dog — exercises duplicate detection review.
  const twinBase = strays[0]!;
  const twin = jitter(twinBase.latitude, twinBase.longitude, 120);
  strays.push(
    await prisma.communityStray.create({
      data: {
        registeredById: rescueUsers[2]!.id,
        tagOrEarMark: twinBase.tagOrEarMark ? twinBase.tagOrEarMark.replace(/-0*/, "-") : "KTM-E-77",
        species: "DOG",
        gender: twinBase.gender,
        estimatedAge: twinBase.estimatedAge,
        color: twinBase.color,
        breed: twinBase.breed,
        physicalDescription: twinBase.physicalDescription,
        photoUrl: twinBase.photoUrl,
        latitude: twin.lat,
        longitude: twin.lng,
        address: twinBase.address,
        wardNumber: twinBase.wardNumber,
        municipality: twinBase.municipality,
        createdAt: daysAgo(3, 10),
      },
    }),
  );

  // -------------------------------------------------------------- CNVR ---
  const cnvrRecords = [];
  for (let i = 0; i < strays.length && cnvrRecords.length < 36; i++) {
    const s = strays[i]!;
    if (i % 6 === 5) continue; // some strays still awaiting CNVR
    const org = i < 8 ? orgs[0]! : pick(verifiedOrgs);
    const caught = new Date(Math.max(s.createdAt.getTime(), NOW - 29 * DAY) + int(0, 2) * DAY);
    const at = caught.getTime() > NOW ? new Date(NOW - int(1, 12) * HOUR) : caught;
    const sterilize = chance(0.8);
    const release = jitter(s.latitude, s.longitude, 150);
    cnvrRecords.push(
      await prisma.cnvrRecord.create({
        data: {
          strayId: s.id,
          organizationId: org.id,
          vaccineName: pick(RABIES),
          vaccinationDate: at,
          sterilizationDate: sterilize ? new Date(at.getTime() + int(0, 1) * DAY) : null,
          releaseLatitude: release.lat,
          releaseLongitude: release.lng,
          releaseDate: new Date(at.getTime() + int(2, 5) * DAY > NOW ? NOW - HOUR : at.getTime() + int(2, 5) * DAY),
          notes: pick([
            "Ear notched (left) after sterilisation. Recovered well.",
            "Mild post-op swelling; antibiotics for 5 days before release.",
            "Released at capture site per CNVR protocol.",
            "Lactating female — sterilisation deferred, vaccinated only.",
            "Treated for mange before release.",
          ]),
          createdAt: at,
        },
      }),
    );
    // Annual re-vaccination history for older registrations.
    if (s.createdAt.getTime() < NOW - 200 * DAY && chance(0.6)) {
      const old = new Date(s.createdAt.getTime() + int(1, 10) * DAY);
      cnvrRecords.push(
        await prisma.cnvrRecord.create({
          data: {
            strayId: s.id,
            organizationId: org.id,
            vaccineName: pick(RABIES),
            vaccinationDate: old,
            sterilizationDate: new Date(old.getTime() + DAY),
            releaseLatitude: release.lat,
            releaseLongitude: release.lng,
            releaseDate: new Date(old.getTime() + 4 * DAY),
            notes: "Initial capture: sterilised, vaccinated and released.",
            createdAt: old,
          },
        }),
      );
    }
  }

  // --------------------------------------------------------- incidents ---
  const INCIDENT_TEXT: { t: string; suspected: boolean; animal: AnimalType }[] = [
    { t: "A stray dog bit a child on the leg near {p}. The wound was washed and the family went to hospital.", suspected: false, animal: "DOG" },
    { t: "Aggressive dog chasing pedestrians near {p}; one person bitten on the calf.", suspected: false, animal: "DOG" },
    { t: "Dog drooling, staggering and snapping at other dogs near {p}. Bit a street vendor's hand.", suspected: true, animal: "DOG" },
    { t: "Delivery rider bitten on the thigh by a dog near {p}; deep puncture wound.", suspected: false, animal: "DOG" },
    { t: "Street dog bit an elderly woman at the morning market in {p}.", suspected: false, animal: "DOG" },
    { t: "Dog that bit a man two days ago near {p} has since died; residents suspect rabies.", suspected: true, animal: "DOG" },
    { t: "Dog with no ear notch seen frothing at the mouth near {p}; it bit another dog and a passer-by.", suspected: true, animal: "DOG" },
    { t: "Pack of dogs attacked a goat and bit a boy who tried to intervene near {p}.", suspected: false, animal: "DOG" },
    { t: "Pet cat scratched and bit its owner's hand near {p}; cat's vaccination status unknown.", suspected: false, animal: "CAT" },
    { t: "Unusually aggressive cat bit two children in a courtyard near {p}.", suspected: true, animal: "CAT" },
    { t: "Monkey scratched a visitor's arm while being fed near {p}.", suspected: false, animal: "MONKEY" },
    { t: "Jackal entered a farmyard on the outskirts of {p} and bit a farmer at night.", suspected: true, animal: "JACKAL" },
  ];
  const hotspots = [
    { L: loc("Kalanki"), n: 13, radius: 450 },
    { L: loc("Koteshwor"), n: 9, radius: 400 },
    { L: loc("Patan"), n: 8, radius: 380 },
  ];
  const statusPool: IncidentStatus[] = ["REPORTED", "REPORTED", "REPORTED", "UNDER_REVIEW", "UNDER_REVIEW", "VERIFIED", "VERIFIED", "RESOLVED", "RESOLVED", "RESOLVED", "DISMISSED"];
  const incidentPlaces: { L: Locality; p: { lat: number; lng: number } }[] = [];
  for (const h of hotspots) for (let k = 0; k < h.n; k++) incidentPlaces.push({ L: h.L, p: jitter(h.L.lat, h.L.lng, h.radius) });
  for (let k = 0; k < 34; k++) {
    const L = pick(LOCALITIES);
    incidentPlaces.push({ L, p: jitter(L.lat, L.lng, 900) });
  }
  const incidents = [];
  for (let k = 0; k < incidentPlaces.length; k++) {
    const { L, p } = incidentPlaces[k]!;
    let tpl = pick(INCIDENT_TEXT);
    if (L.name === "Swayambhu" && chance(0.6)) tpl = INCIDENT_TEXT[10]!;
    const suspected = tpl.suspected || chance(0.08);
    const severity: Severity = suspected ? pick(["HIGH", "HIGH", "MODERATE"]) : pick(["LOW", "MODERATE", "MODERATE", "HIGH"]);
    const incidentDate = daysAgo(int(0, 29), 23);
    const ageDays = (NOW - incidentDate.getTime()) / DAY;
    // Older reports are further along the workflow.
    const status: IncidentStatus = ageDays < 2 ? "REPORTED" : pick(statusPool);
    const guest = chance(0.35);
    const reporter = guest ? null : chance(0.3) ? demoOwner : pick(owners);
    const handler = status === "REPORTED" ? null : officerFor(L.municipality);
    incidents.push(
      await prisma.biteIncident.create({
        data: {
          reportedById: reporter?.id ?? null,
          reporterName: guest ? `${pick(FIRST)} ${pick(LAST)}` : null,
          reporterPhone: guest ? phone() : null,
          animalType: tpl.animal,
          severity,
          description: tpl.t.replace("{p}", L.landmark),
          incidentDate,
          suspectedRabies: suspected,
          photoUrl: null,
          latitude: p.lat,
          longitude: p.lng,
          locationAccuracyM: pick([5, 8, 12, 20, 35, 60]),
          address: L.landmark,
          wardNumber: L.ward,
          municipality: L.municipality,
          status,
          handledById: handler?.id ?? null,
          statusNote:
            status === "RESOLVED"
              ? pick(["Victim completed PEP course; dog vaccinated by CNVR team.", "Animal located and observed for 10 days — no further incidents.", "Referred to municipal animal control; case closed."])
              : status === "DISMISSED"
                ? "Duplicate of an earlier report for the same event."
                : status === "VERIFIED"
                  ? "Confirmed by ward office field visit."
                  : status === "UNDER_REVIEW"
                    ? "Ward health assistant contacting the reporter."
                    : null,
          createdAt: new Date(incidentDate.getTime() + int(1, 6) * HOUR),
        },
      }),
    );
  }

  // ---------------------------------------------------- lost & scans ---
  const lostPets = [pets[1]!, ...pets.slice(10, 21)]; // Momo (demo owner) + 11 others
  const lostReports = [];
  for (const pet of lostPets) {
    const owner = users.find((u) => u.id === pet.ownerId)!;
    const L = LOCALITIES.find((l) => l.municipality === owner.municipality && l.ward === owner.wardNumber) ?? pick(LOCALITIES);
    const p = jitter(L.lat, L.lng, 800);
    await prisma.pet.update({ where: { id: pet.id }, data: { lostStatus: true } });
    lostReports.push(
      await prisma.lostPetReport.create({
        data: {
          petId: pet.id,
          lastSeenLatitude: p.lat,
          lastSeenLongitude: p.lng,
          lastSeenDate: daysAgo(int(0, 12), 20),
          description: pick([
            `Ran off during fireworks near ${L.landmark}. Wearing a red collar with QR tag.`,
            `Slipped the leash on a morning walk at ${L.landmark}. Very friendly, answers to name.`,
            `Gate left open; last seen heading towards ${L.landmark}.`,
            `Went missing after Tihar celebrations near ${L.landmark}. Scared of loud noises.`,
          ]),
          status: "ACTIVE",
          createdAt: daysAgo(int(0, 12)),
        },
      }),
    );
  }
  for (const pet of pets.slice(21, 30)) {
    const found = chance(0.75);
    const seen = daysAgo(int(15, 120));
    lostReports.push(
      await prisma.lostPetReport.create({
        data: {
          petId: pet.id,
          lastSeenLatitude: null,
          lastSeenLongitude: null,
          lastSeenDate: seen,
          description: found ? "Found two streets away thanks to a neighbour scanning the QR tag." : "Report cancelled — pet was hiding at home.",
          status: found ? LostReportStatus.FOUND : LostReportStatus.CANCELLED,
          createdAt: seen,
          resolvedAt: new Date(seen.getTime() + int(4, 72) * HOUR),
        },
      }),
    );
  }
  const scans = [];
  for (let i = 0; i < 32; i++) {
    const report = lostReports[i % 12]!;
    const pet = lostPets[i % 12]!;
    const share = chance(0.65);
    const p = share && report.lastSeenLatitude ? jitter(report.lastSeenLatitude, report.lastSeenLongitude!, 1500) : null;
    const scannedAt = new Date(Math.min(NOW - 10 * 60_000, report.createdAt.getTime() + int(1, 96) * HOUR));
    scans.push(
      await prisma.qrScanEvent.create({
        data: {
          petId: pet.id,
          scannedAt,
          sharedLatitude: p?.lat ?? null,
          sharedLongitude: p?.lng ?? null,
          locationPermission: !!p,
          finderMessage: chance(0.6)
            ? pick(["Your dog is sitting outside our tea shop, we gave it water.", "Saw this pet near the bus stop, looked tired.", "We are keeping it in our courtyard, please call.", "It ran away when I tried to approach."])
            : null,
          finderContact: chance(0.4) ? phone() : null,
          deviceOrSessionInfo: pick(["Android / Chrome", "iOS / Safari", "Android / Chrome", "Windows / Edge"]),
        },
      }),
    );
  }

  // ------------------------------------------------------ AI breed log ---
  const predictions = [];
  for (let i = 0; i < 26; i++) {
    const pet = pets[i % pets.length]!;
    const actual = pet.breed ?? "Local Nepali / Mixed breed";
    const correct = chance(0.62);
    const predicted = correct ? actual : pet.species === "CAT" ? pick(CAT_BREEDS) : pick(DOG_BREEDS);
    const answered = chance(0.85);
    predictions.push(
      await prisma.aiBreedPrediction.create({
        data: {
          petId: pet.id,
          imageUrl: pet.photoUrl ?? "/uploads/seed/pet-01.svg",
          predictedBreed: predicted,
          confidenceScore: Math.round((correct ? 0.42 + rand() * 0.3 : 0.18 + rand() * 0.3) * 1000) / 1000,
          alternatives: JSON.stringify(
            [actual, ...(pet.species === "CAT" ? CAT_BREEDS : DOG_BREEDS)]
              .filter((b, idx, arr) => b !== predicted && arr.indexOf(b) === idx)
              .slice(0, 4)
              .map((b, k) => ({ breed: b, score: Math.round((0.2 - k * 0.04) * 1000) / 1000 })),
          ),
          modelVersion: "heuristic-coat-v1",
          ownerConfirmed: answered ? predicted === actual : null,
          finalBreed: answered ? actual : null,
          createdAt: new Date(pet.createdAt.getTime() + int(0, 3) * 60_000),
        },
      }),
    );
  }

  // ----------------------------------------------------- notifications ---
  type N = { userId: string; type: NotificationType; title: string; message: string; link: string; at: Date; read: boolean; dedupeKey?: string; scheduled?: boolean };
  const notes: N[] = [];
  const verifiedRabiesOf = (petId: string) =>
    vaccinationRecords.filter((r) => r.petId === petId && r.status === "VERIFIED").sort((a, b) => b.administeredDate.getTime() - a.administeredDate.getTime())[0];
  for (const pet of pets.slice(0, 20)) {
    const r = verifiedRabiesOf(pet.id);
    if (!r?.boosterDueDate) continue;
    const left = (r.boosterDueDate.getTime() - NOW) / DAY;
    if (left < 0) {
      notes.push({ userId: pet.ownerId, type: "BOOSTER_OVERDUE", title: `${pet.name}'s ${r.vaccineName} booster is overdue`, message: `The booster was due on ${r.boosterDueDate.toISOString().slice(0, 10)}. Please visit a registered veterinary clinic as soon as possible.`, link: `/app/pets/${pet.id}`, at: new Date(r.boosterDueDate.getTime() + HOUR), read: chance(0.4), dedupeKey: `vax:${r.id}:overdue` });
    } else if (left <= 30) {
      notes.push({ userId: pet.ownerId, type: "VACCINATION_REMINDER", title: `${pet.name}'s ${r.vaccineName} booster is due soon`, message: `The booster is due on ${r.boosterDueDate.toISOString().slice(0, 10)}. Book a visit with your vet before the due date.`, link: `/app/pets/${pet.id}`, at: new Date(r.boosterDueDate.getTime() - 30 * DAY), read: chance(0.3), dedupeKey: `vax:${r.id}:due` });
    }
  }
  for (const s of scans.slice(0, 14)) {
    const pet = pets.find((p) => p.id === s.petId)!;
    notes.push({ userId: pet.ownerId, type: "LOST_PET_SCAN", title: `Someone may have found ${pet.name}!`, message: `${s.locationPermission ? "They shared the location where the pet is." : "No location was shared."}${s.finderMessage ? ` Message: "${s.finderMessage}"` : ""}`, link: `/app/pets/${pet.id}?tab=scans`, at: s.scannedAt, read: chance(0.5) });
  }
  for (const inc of incidents.filter((x) => x.suspectedRabies || x.severity === "HIGH").slice(0, 12)) {
    const officer = officerFor(inc.municipality);
    notes.push({ userId: officer.id, type: "INCIDENT_UPDATE", title: inc.suspectedRabies ? "New suspected-rabies report" : "New high-severity bite report", message: `${inc.animalType.toLowerCase()} incident at ${inc.address}, Ward ${inc.wardNumber}, ${inc.municipality} on ${inc.incidentDate.toISOString().slice(0, 10)}.`, link: `/app/incidents/${inc.id}`, at: inc.createdAt, read: chance(0.5), dedupeKey: `incident:${inc.id}:new:${officer.id}` });
  }
  for (const h of hotspots) {
    const officer = officerFor(h.L.municipality);
    for (const u of [officer, admin]) {
      notes.push({ userId: u.id, type: "CLUSTER_ALERT", title: `Incident cluster detected near ${h.L.landmark}`, message: `${h.n} reports within 600 m in the last 14 days. This reflects reported activity, not confirmed cases.`, link: `/app/map?focus=${h.L.lat},${h.L.lng}&layer=clusters`, at: daysAgo(int(1, 6)), read: false });
    }
  }
  for (const inc of incidents.filter((x) => x.reportedById && x.status !== "REPORTED").slice(0, 8)) {
    notes.push({ userId: inc.reportedById!, type: "INCIDENT_UPDATE", title: `Your incident report is ${inc.status.toLowerCase().replace("_", " ")}`, message: inc.statusNote ? `Update from the ward office: ${inc.statusNote}` : "The ward office updated your report.", link: `/app/incidents/${inc.id}`, at: new Date(inc.createdAt.getTime() + int(4, 40) * HOUR), read: chance(0.6) });
  }
  notes.push({ userId: demoVet.id, type: "ACCOUNT", title: "Vaccination records awaiting verification", message: "6 owner-submitted records are waiting for your clinic to verify.", link: "/app/vaccinations?status=PENDING_VERIFICATION", at: daysAgo(1), read: false });
  for (const c of clinics.filter((x) => x.verificationStatus === "PENDING")) {
    notes.push({ userId: admin.id, type: "ACCOUNT", title: "Clinic awaiting verification", message: `${c.clinicName} (${c.registrationNumber}) registered and needs review.`, link: `/app/clinics/${c.id}`, at: c.createdAt, read: false });
  }
  notes.push({ userId: demoOwner.id, type: "VACCINATION_REMINDER", title: "Annual check-up reminder for Kali", message: "It's almost a year since Kali's last visit. A yearly check-up keeps vaccinations on track.", link: `/app/pets/${pets[2]!.id}`, at: new Date(NOW + 3 * DAY), read: false, scheduled: true });
  for (const n of notes) {
    const future = n.at.getTime() > NOW;
    await prisma.notification.create({
      data: {
        userId: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        scheduledAt: n.at,
        sentAt: future ? null : n.at,
        readAt: !future && n.read ? new Date(Math.min(NOW, n.at.getTime() + int(1, 30) * HOUR)) : null,
        status: future ? NotificationStatus.SCHEDULED : n.read ? NotificationStatus.READ : NotificationStatus.SENT,
        dedupeKey: n.dedupeKey ?? null,
      },
    });
  }

  // -------------------------------------------------------- audit logs ---
  const audits: { actorId: string | null; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; at: Date }[] = [];
  for (const r of vaccinationRecords.filter((v) => v.status === "VERIFIED" && v.verifiedAt && v.verifiedAt.getTime() > NOW - 30 * DAY).slice(0, 14)) {
    audits.push({ actorId: r.recordedById, action: "VACCINATION_VERIFIED", entityType: "VaccinationRecord", entityId: r.id, before: { status: "PENDING_VERIFICATION" }, after: { status: "VERIFIED", vaccineName: r.vaccineName, batchNumber: r.batchNumber }, at: r.verifiedAt! });
  }
  for (const r of vaccinationRecords.filter((v) => v.status === "REVOKED")) {
    audits.push({ actorId: clinics.find((c) => c.id === r.vetId)!.userId, action: "VACCINATION_REVOKED", entityType: "VaccinationRecord", entityId: r.id, before: { status: "VERIFIED" }, after: { status: "REVOKED" }, at: r.verifiedAt ?? r.createdAt });
  }
  for (const inc of incidents) {
    audits.push({ actorId: inc.reportedById, action: "INCIDENT_CREATED", entityType: "BiteIncident", entityId: inc.id, after: { severity: inc.severity, suspectedRabies: inc.suspectedRabies, guest: !inc.reportedById }, at: inc.createdAt });
    if (inc.status !== "REPORTED") {
      audits.push({ actorId: inc.handledById, action: "INCIDENT_STATUS_CHANGED", entityType: "BiteIncident", entityId: inc.id, before: { status: "REPORTED" }, after: { status: inc.status, note: inc.statusNote }, at: new Date(inc.createdAt.getTime() + int(2, 30) * HOUR) });
    }
  }
  for (const c of cnvrRecords.slice(0, 15)) {
    audits.push({ actorId: orgs.find((o) => o.id === c.organizationId)!.userId, action: "CNVR_CREATED", entityType: "CnvrRecord", entityId: c.id, after: { strayId: c.strayId, sterilized: !!c.sterilizationDate }, at: c.createdAt });
  }
  for (const c of clinics.filter((x) => x.verificationStatus !== "PENDING")) {
    audits.push({ actorId: admin.id, action: "CLINIC_VERIFICATION_CHANGED", entityType: "VeterinaryClinic", entityId: c.id, before: { verificationStatus: "PENDING" }, after: { verificationStatus: c.verificationStatus }, at: new Date(c.createdAt.getTime() + 2 * DAY) });
  }
  for (const o of orgs.filter((x) => x.verificationStatus !== "PENDING")) {
    audits.push({ actorId: admin.id, action: "ORGANIZATION_VERIFICATION_CHANGED", entityType: "RescueOrganization", entityId: o.id, before: { verificationStatus: "PENDING" }, after: { verificationStatus: o.verificationStatus }, at: new Date(o.createdAt.getTime() + 3 * DAY) });
  }
  audits.push({ actorId: operator.id, action: "REPORT_EXPORTED", entityType: "Report", entityId: "incidents", after: { format: "csv", rows: 41 }, at: daysAgo(2) });
  await prisma.auditLog.createMany({
    data: audits.map((a) => ({
      actorId: a.actorId,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      before: a.before === undefined ? null : JSON.stringify(a.before),
      after: a.after === undefined ? null : JSON.stringify(a.after),
      ipHash: randomBytes(12).toString("hex"),
      createdAt: a.at,
    })),
  });

  // ---------------------------------------------- historical sessions ---
  // Past sign-ins (expired / revoked). Live sessions are created by real logins.
  const sessionUsers = [admin, operator, demoOwner, demoVet, demoRescue, ...owners.slice(1, 10), ...officers.slice(1), ...vetUsers.slice(1, 4)];
  for (const u of sessionUsers.slice(0, 22)) {
    const created = daysAgo(int(8, 60));
    const revoked = chance(0.5);
    await prisma.session.create({
      data: {
        userId: u.id,
        createdAt: created,
        expiresAt: new Date(created.getTime() + 7 * DAY),
        revokedAt: revoked ? new Date(created.getTime() + int(1, 48) * HOUR) : null,
        userAgent: pick(["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0", "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1"]),
      },
    });
  }

  // ------------------------------------------------ owner ↔ vet chat ---
  const THREADS: { subject: string; lines: [string, string][] }[] = [
    { subject: "Booster appointment", lines: [["owner", "Namaste doctor, {pet}'s rabies booster is due soon. Can I bring them on Sunday?"], ["vet", "Namaste! Sunday 11 AM works. Please bring the vaccination card."], ["owner", "Thank you, we'll be there."]] },
    { subject: "Vomiting after vaccine", lines: [["owner", "{pet} vomited once this morning after yesterday's shot. Should I worry?"], ["vet", "One episode can be a mild reaction. Keep water available and watch for 24 hours. If it repeats or {pet} becomes lethargic, come in immediately."], ["owner", "Okay, will monitor."], ["vet", "Please message us this evening with an update."]] },
    { subject: "Paper card verification", lines: [["owner", "I submitted {pet}'s old paper vaccination card for verification. Do you need the original?"], ["vet", "Yes, please bring the original card so we can match the batch number with our register."]] },
    { subject: "Deworming schedule", lines: [["owner", "How often should {pet} be dewormed?"], ["vet", "For adult dogs in the valley we recommend every 3 months. We can do it during the next visit."], ["owner", "Great, please add it."]] },
    { subject: "Tick problem", lines: [["owner", "Found several ticks on {pet} after a walk near the river."], ["vet", "Remove them with tweezers close to the skin, don't squeeze the body. Come in for a spot-on treatment this week."]] },
  ];
  let messageCount = 0;
  const conversationPairs = new Set<string>();
  for (let i = 0; i < 22; i++) {
    const pet = pets[i]!;
    const clinic = i < 7 ? demoClinic : pick(verifiedClinics);
    const key = `${pet.ownerId}:${clinic.id}:${pet.id}`;
    if (conversationPairs.has(key)) continue;
    conversationPairs.add(key);
    const thread = THREADS[i % THREADS.length]!;
    const start = daysAgo(int(1, 28), 20);
    const conv = await prisma.conversation.create({ data: { ownerId: pet.ownerId, clinicId: clinic.id, petId: pet.id, subject: thread.subject, createdAt: start } });
    let t = start.getTime();
    for (let k = 0; k < thread.lines.length; k++) {
      const [who, text] = thread.lines[k]!;
      t += int(5, 240) * 60_000;
      const at = new Date(Math.min(t, NOW - 60_000));
      const last = k === thread.lines.length - 1;
      await prisma.chatMessage.create({
        data: {
          conversationId: conv.id,
          senderId: who === "owner" ? pet.ownerId : clinic.userId,
          body: text.replaceAll("{pet}", pet.name),
          createdAt: at,
          readAt: last && chance(0.5) ? null : new Date(Math.min(NOW, at.getTime() + 30 * 60_000)),
        },
      });
      messageCount++;
    }
    await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date(Math.min(t, NOW)) } });
  }

  // ------------------------------------------------------ chatbot logs ---
  const QUESTIONS: { q: string; who: User | null; helpful: boolean | null }[] = [
    { q: "How do I register my dog?", who: demoOwner, helpful: true },
    { q: "When is the rabies booster due for a puppy?", who: demoOwner, helpful: true },
    { q: "A street dog bit my son near Kalanki, what should I do?", who: null, helpful: true },
    { q: "Does my dog have rabies? He is drooling a lot", who: owners[3] ?? null, helpful: true },
    { q: "How does the QR tag work?", who: owners[5] ?? null, helpful: true },
    { q: "My cat is lost, help", who: owners[6] ?? null, helpful: null },
    { q: "Find a vet near Patan", who: null, helpful: true },
    { q: "What is CNVR?", who: demoRescue, helpful: true },
    { q: "मेरो कुकुर हरायो, के गर्ने?", who: owners[8] ?? null, helpful: true },
    { q: "कुकुरले टोक्यो, अब के गर्ने?", who: null, helpful: true },
    { q: "खोप कहिले लगाउने?", who: owners[9] ?? null, helpful: null },
    { q: "How can I download the vaccination certificate?", who: demoOwner, helpful: true },
    { q: "Can you identify my dog's breed?", who: owners[10] ?? null, helpful: false },
    { q: "Where can I adopt a dog?", who: null, helpful: null },
    { q: "How do I report an aggressive dog?", who: null, helpful: true },
    { q: "What food is bad for dogs?", who: owners[11] ?? null, helpful: true },
    { q: "Is there a shelter in Bhaktapur?", who: null, helpful: null },
    { q: "Monkey scratched me at Swayambhu", who: null, helpful: true },
    { q: "Can I change the language to Nepali?", who: owners[12] ?? null, helpful: true },
    { q: "what are the symptoms of rabies in dogs", who: null, helpful: true },
    { q: "hello", who: null, helpful: null },
    { q: "How much does registration cost?", who: owners[13] ?? null, helpful: false },
    { q: "My neighbour's dog licked my cut, is that dangerous?", who: null, helpful: true },
    { q: "How often should I deworm my puppy?", who: owners[14] ?? null, helpful: true },
    { q: "Call me on 9841234567 about my lost dog", who: null, helpful: null },
    { q: "नजिकको पशु चिकित्सक कहाँ छ?", who: null, helpful: true },
  ];
  for (let i = 0; i < QUESTIONS.length; i++) {
    const { q, who, helpful } = QUESTIONS[i]!;
    const a = reply(q, who?.locale);
    await prisma.chatbotLog.create({
      data: {
        userId: who?.id ?? null,
        sessionKey: randomBytes(12).toString("base64url"),
        locale: a.locale,
        question: scrubPii(q),
        intent: a.intent,
        answer: a.answer,
        safetyEscalated: a.safetyEscalated,
        responseMs: int(1, 6),
        helpful,
        createdAt: daysAgo(int(0, 29), 23),
      },
    });
  }

  // ----------------------------------------------------------- summary ---
  const counts = {
    users: await prisma.user.count(),
    accounts: await prisma.account.count(),
    sessions: await prisma.session.count(),
    pets: await prisma.pet.count(),
    vaccinationRecords: await prisma.vaccinationRecord.count(),
    veterinaryClinics: await prisma.veterinaryClinic.count(),
    rescueOrganizations: await prisma.rescueOrganization.count(),
    communityStrays: await prisma.communityStray.count(),
    cnvrRecords: await prisma.cnvrRecord.count(),
    biteIncidents: await prisma.biteIncident.count(),
    lostPetReports: await prisma.lostPetReport.count(),
    qrScanEvents: await prisma.qrScanEvent.count(),
    notifications: await prisma.notification.count(),
    aiBreedPredictions: await prisma.aiBreedPrediction.count(),
    auditLogs: await prisma.auditLog.count(),
    conversations: await prisma.conversation.count(),
    chatMessages: await prisma.chatMessage.count(),
    chatbotLogs: await prisma.chatbotLog.count(),
  };
  console.table(counts);
  const thin = Object.entries(counts).filter(([, n]) => n < 20);
  if (thin.length) throw new Error(`Seed produced fewer than 20 rows for: ${thin.map(([k]) => k).join(", ")}`);
  void vaccinationCount;
  void messageCount;

  console.log("\nTest accounts:");
  console.table([
    { role: "ADMIN", email: "admin@local.dev", password: "Admin@1234" },
    { role: "WARD_OFFICER (operator)", email: "operator@local.dev", password: "Operator@1234" },
    { role: "PET_OWNER (user)", email: "user@local.dev", password: "User@1234" },
    { role: "VET_CLINIC", email: "vet@local.dev", password: "Vet@1234" },
    { role: "RESCUE_ORG", email: "rescue@local.dev", password: "Rescue@1234" },
    { role: "all other seeded users", email: "<see users table>", password: "Password@123" },
  ]);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
