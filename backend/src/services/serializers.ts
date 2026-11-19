import type { Prisma } from "@prisma/client";
import { publicPetPath } from "./qr";
import { summarizeVaccinations } from "./vaccination";

export const vaccinationSummarySelect = {
  id: true,
  vaccineName: true,
  administeredDate: true,
  boosterDueDate: true,
  status: true,
} satisfies Prisma.VaccinationRecordSelect;

export const petListInclude = {
  owner: { select: { id: true, fullName: true, phone: true, municipality: true, wardNumber: true } },
  vaccinationRecords: { select: vaccinationSummarySelect },
  _count: { select: { lostPetReports: true, qrScanEvents: true } },
} satisfies Prisma.PetInclude;

type WithRecords = { vaccinationRecords: Parameters<typeof summarizeVaccinations>[0] };

/** Replaces raw records with a derived Up to Date / Due Soon / Overdue summary. */
export function withVaccinationSummary<T extends WithRecords>(pet: T) {
  const { vaccinationRecords, ...rest } = pet;
  return { ...rest, vaccination: summarizeVaccinations(vaccinationRecords) };
}

export const publicPetInclude = {
  owner: { select: { fullName: true, phone: true } },
  vaccinationRecords: {
    where: { status: "VERIFIED" },
    orderBy: { administeredDate: "desc" },
    include: { clinic: { select: { clinicName: true, phone: true } } },
  },
  lostPetReports: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.PetInclude;

type PublicPet = Prisma.PetGetPayload<{ include: typeof publicPetInclude }>;

/**
 * Public emergency profile shown when a QR tag is scanned (Sections H.4, U).
 * Owner phone is disclosed only while the pet is in lost mode; medical notes,
 * owner address and exact locations are never exposed.
 */
export function publicPetProfile(pet: PublicPet) {
  const summary = summarizeVaccinations(pet.vaccinationRecords);
  const lastRabies = pet.vaccinationRecords.find((r) => summary.rabies?.latestRecordId === r.id);
  const lost = pet.lostPetReports[0];
  const firstName = pet.owner.fullName.split(" ")[0] ?? pet.owner.fullName;
  return {
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    gender: pet.gender,
    color: pet.color,
    photoUrl: pet.photoUrl,
    ageYears: pet.dateOfBirth ? Math.floor((Date.now() - pet.dateOfBirth.getTime()) / (365.25 * 86_400_000)) : null,
    lostStatus: pet.lostStatus,
    lost: lost
      ? { since: lost.lastSeenDate, description: lost.description }
      : null,
    vaccination: {
      status: summary.status,
      rabies: summary.rabies
        ? {
            status: summary.rabies.status,
            administeredDate: summary.rabies.administeredDate,
            boosterDueDate: summary.rabies.boosterDueDate,
            clinicName: lastRabies?.clinic.clinicName ?? null,
          }
        : null,
      verifiedCount: pet.vaccinationRecords.length,
    },
    owner: pet.lostStatus
      ? { firstName, phone: pet.owner.phone, contactVisible: true as const }
      : { firstName, phone: null, contactVisible: false as const },
    profilePath: publicPetPath(pet.qrToken),
  };
}
