/* eslint-disable no-console */
// Add the five demo logins without deleting or replacing application data.
import "../src/config/env";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const checkOnly = process.argv.includes("--check");
const KMC = "Kathmandu Metropolitan City";

const demos = [
  { email: "admin@local.dev", password: "Admin@1234", fullName: "System Administrator", role: Role.ADMIN, municipality: null, wardNumber: null },
  { email: "operator@local.dev", password: "Operator@1234", fullName: "Sita Maharjan", role: Role.WARD_OFFICER, municipality: KMC, wardNumber: 14 },
  { email: "user@local.dev", password: "User@1234", fullName: "Aarav Shrestha", role: Role.PET_OWNER, municipality: KMC, wardNumber: 10 },
  { email: "vet@local.dev", password: "Vet@1234", fullName: "Dr. Prakash Adhikari", role: Role.VET_CLINIC, municipality: KMC, wardNumber: 10 },
  { email: "rescue@local.dev", password: "Rescue@1234", fullName: "Kabita Tamang", role: Role.RESCUE_ORG, municipality: KMC, wardNumber: 14 },
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const target = new URL(url);
  console.log(`Target: ${target.hostname}/${target.pathname.slice(1)}${checkOnly ? " (check only)" : ""}`);

  const existing = await prisma.user.findMany({
    where: { email: { in: demos.map((d) => d.email) } },
    select: { id: true, email: true, role: true, isActive: true, passwordHash: true, accounts: { where: { provider: "credentials" }, select: { id: true } }, veterinaryClinic: { select: { verificationStatus: true } }, rescueOrganization: { select: { verificationStatus: true } } },
  });
  for (const demo of demos) {
    const user = existing.find((u) => u.email === demo.email);
    if (user && user.role !== demo.role) throw new Error(`${demo.email} has role ${user.role}; refusing to change it to ${demo.role}`);
    const passwordMatches = user ? await bcrypt.compare(demo.password, user.passwordHash) : false;
    const profileReady = demo.role === Role.VET_CLINIC ? user?.veterinaryClinic?.verificationStatus === "VERIFIED"
      : demo.role === Role.RESCUE_ORG ? user?.rescueOrganization?.verificationStatus === "VERIFIED" : true;
    console.log(`${demo.email}: ${user ? `exists (${user.isActive ? "active" : "inactive"}, ${user.accounts.length} credential account, password ${passwordMatches ? "matches" : "differs"}, profile ${profileReady ? "ready" : "missing or unverified"})` : "missing"}`);
  }
  if (checkOnly) return;

  const hashes = await Promise.all(demos.map((demo) => bcrypt.hash(demo.password, 12)));
  await prisma.$transaction(async (tx) => {
    for (const [index, demo] of demos.entries()) {
      const account = await tx.account.findUnique({
        where: { provider_providerAccountId: { provider: "credentials", providerAccountId: demo.email } },
        select: { userId: true },
      });
      const oldUser = existing.find((u) => u.email === demo.email);
      if (account && account.userId !== oldUser?.id) throw new Error(`${demo.email} credential account belongs to another user`);

      const user = await tx.user.upsert({
        where: { email: demo.email },
        create: { email: demo.email, fullName: demo.fullName, passwordHash: hashes[index]!, role: demo.role, municipality: demo.municipality, wardNumber: demo.wardNumber,
          accounts: { create: { provider: "credentials", providerAccountId: demo.email } } },
        update: { passwordHash: hashes[index]!, isActive: true },
      });
      if (!account && oldUser) {
        await tx.account.create({ data: { userId: user.id, provider: "credentials", providerAccountId: demo.email } });
      }

      if (demo.role === Role.VET_CLINIC) {
        await tx.veterinaryClinic.upsert({
          where: { userId: user.id },
          create: { userId: user.id, clinicName: "Baneshwor Animal Care Clinic", registrationNumber: "NVC-2018-1000", phone: "01-4780000", address: `New Baneshwor Chowk, Baneshwor, ${KMC}`, wardNumber: 10, municipality: KMC, latitude: 27.6915, longitude: 85.342, verificationStatus: "VERIFIED" },
          update: { verificationStatus: "VERIFIED" },
        });
      }
      if (demo.role === Role.RESCUE_ORG) {
        await tx.rescueOrganization.upsert({
          where: { userId: user.id },
          create: { userId: user.id, organizationName: "Bagmati Paws Rescue", phone: "9841000004", address: `Kalanki Chowk, Kalanki, ${KMC}`, wardNumber: 14, municipality: KMC, latitude: 27.6935, longitude: 85.2817, verificationStatus: "VERIFIED" },
          update: { verificationStatus: "VERIFIED" },
        });
      }
    }
  }, { timeout: 60_000 });
  console.log("Demo accounts are ready.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
