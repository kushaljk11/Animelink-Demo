/* eslint-disable no-console */
// Rabies Track Nepal — empty database for testing from scratch.
//
//   npm run db:clean     deletes every row (schema kept) and leaves ONE admin account
//   npm run db:demo      same, but leaves the five demo accounts (vet + rescue org verified, no other data)
//
// ADMIN can't be self-registered, so it is always kept. `npm run db:seed` brings the full demo data back.
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const demo = process.argv.includes("--demo");
const KMC = "Kathmandu Metropolitan City";

async function account(fullName: string, email: string, password: string, role: Role, extra: { phone?: string; municipality?: string; wardNumber?: number } = {}) {
  return prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role,
      ...extra,
      accounts: { create: { provider: "credentials", providerAccountId: email } },
    },
  });
}

async function main() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
  fs.rmSync(path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads", "seed"), { recursive: true, force: true });

  await account("System Administrator", "admin@local.dev", "Admin@1234", Role.ADMIN);
  const rows = [["ADMIN", "admin@local.dev", "Admin@1234"]];

  if (demo) {
    await account("Sita Maharjan", "operator@local.dev", "Operator@1234", Role.WARD_OFFICER, { phone: "9841000001", municipality: KMC, wardNumber: 14 });
    await account("Aarav Shrestha", "user@local.dev", "User@1234", Role.PET_OWNER, { phone: "9841000002", municipality: KMC, wardNumber: 10 });
    const vet = await account("Dr. Prakash Adhikari", "vet@local.dev", "Vet@1234", Role.VET_CLINIC, { phone: "9841000003", municipality: KMC, wardNumber: 10 });
    const rescue = await account("Kabita Tamang", "rescue@local.dev", "Rescue@1234", Role.RESCUE_ORG, { phone: "9841000004", municipality: KMC, wardNumber: 14 });
    await prisma.veterinaryClinic.create({
      data: {
        userId: vet.id,
        clinicName: "Baneshwor Animal Care Clinic",
        registrationNumber: "NVC-2018-1000",
        phone: "01-4780000",
        address: `New Baneshwor Chowk, Baneshwor, ${KMC}`,
        wardNumber: 10,
        municipality: KMC,
        latitude: 27.6915,
        longitude: 85.342,
        openingHours: "Sun–Fri 9:00–18:00",
        verificationStatus: "VERIFIED",
      },
    });
    await prisma.rescueOrganization.create({
      data: {
        userId: rescue.id,
        organizationName: "Bagmati Paws Rescue",
        phone: "9841000004",
        address: `Kalanki Chowk, Kalanki, ${KMC}`,
        wardNumber: 14,
        municipality: KMC,
        latitude: 27.6935,
        longitude: 85.2817,
        verificationStatus: "VERIFIED",
      },
    });
    rows.push(
      ["WARD_OFFICER", "operator@local.dev", "Operator@1234"],
      ["PET_OWNER", "user@local.dev", "User@1234"],
      ["VET_CLINIC", "vet@local.dev", "Vet@1234"],
      ["RESCUE_ORG", "rescue@local.dev", "Rescue@1234"],
    );
  }
  console.log(`Emptied ${tables.length} tables. Accounts:`);
  console.table(rows.map(([role, email, password]) => ({ role, email, password })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
