/**
 * Load clean PHOS seed-data (from scripts/firebase-to-seed-data.ts) into Postgres.
 * Run after catalog seed: npm run prisma:seed && npm run prisma:seed:prod
 */
import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Sex } from "../src/generated/prisma/client";
import {
  isSanePatientNumberNumeric,
  parsePatientNumberNumeric,
} from "../src/patients/patient-number.util";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type SeedPatient = {
  id: string;
  firebaseKey: string;
  patientNumber: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  sex: Sex;
  dateOfBirth?: string | null;
  phone?: string;
  email?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  createdAt?: string;
};

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

async function main() {
  const seedDir = path.join(__dirname, "seed-data");
  const patientsPath = path.join(seedDir, "patients.json");
  if (!fs.existsSync(patientsPath)) {
    throw new Error(
      `Missing ${patientsPath}. Run: npx tsx scripts/firebase-to-seed-data.ts`,
    );
  }

  const deskEmail = (
    process.env.SEED_DESK_EMAIL ?? "desk@phos.local"
  ).toLowerCase();
  const desk = await prisma.user.findUnique({ where: { email: deskEmail } });
  if (!desk) {
    throw new Error(
      `Front-desk user ${deskEmail} not found. Run npm run prisma:seed first.`,
    );
  }

  const patients = loadJson<SeedPatient[]>(patientsPath);
  console.log(`Seeding ${patients.length} patients as createdBy=${desk.email}…`);

  let upserted = 0;
  let maxSane = 0;
  const BATCH = 50;

  for (let i = 0; i < patients.length; i += BATCH) {
    const chunk = patients.slice(i, i + BATCH);
    await prisma.$transaction(
      chunk.map((p) => {
        const dateOfBirth =
          p.dateOfBirth && p.dateOfBirth.trim()
            ? new Date(p.dateOfBirth)
            : null;
        const createdAt = p.createdAt ? new Date(p.createdAt) : undefined;
        const n = parsePatientNumberNumeric(p.patientNumber);
        if (n != null && isSanePatientNumberNumeric(n) && n > maxSane) {
          maxSane = n;
        }
        return prisma.patient.upsert({
          where: { patientNumber: p.patientNumber },
          update: {
            firstName: p.firstName,
            middleName: p.middleName ?? null,
            lastName: p.lastName,
            sex: p.sex,
            dateOfBirth,
            phone: p.phone ?? null,
            email: p.email ?? null,
            address: p.address ?? null,
            emergencyContactName: p.emergencyContactName ?? null,
            emergencyContactPhone: p.emergencyContactPhone ?? null,
            deletedAt: null,
          },
          create: {
            id: p.id,
            patientNumber: p.patientNumber,
            firstName: p.firstName,
            middleName: p.middleName ?? null,
            lastName: p.lastName,
            sex: p.sex,
            dateOfBirth,
            phone: p.phone ?? null,
            email: p.email ?? null,
            address: p.address ?? null,
            emergencyContactName: p.emergencyContactName ?? null,
            emergencyContactPhone: p.emergencyContactPhone ?? null,
            createdById: desk.id,
            ...(createdAt && !Number.isNaN(createdAt.getTime())
              ? { createdAt }
              : {}),
          },
        });
      }),
    );
    upserted += chunk.length;
    if ((i / BATCH) % 5 === 0 || i + BATCH >= patients.length) {
      console.log(`  … ${Math.min(i + BATCH, patients.length)}/${patients.length}`);
    }
  }

  if (maxSane > 0) {
    // next nextval() returns maxSane + 1
    await prisma.$executeRawUnsafe(
      `SELECT setval('patient_number_seq', ${maxSane}, true)`,
    );
  }

  const count = await prisma.patient.count({ where: { deletedAt: null } });
  console.log(
    `Production seed done. Upserted=${upserted}. Patients in DB=${count}. Sequence synced to max sane HC=${maxSane} (next blank create → HC${(maxSane + 1).toString().padStart(6, "0")}).`,
  );
}

void main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
