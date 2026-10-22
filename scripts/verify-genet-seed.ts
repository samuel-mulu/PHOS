import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const patient = await prisma.patient.findFirst({
    where: { patientNumber: "HC16946", deletedAt: null },
  });
  if (!patient) {
    console.log("HC16946 not found");
    return;
  }
  const ageYears = patient.dateOfBirth
    ? Math.floor(
        (Date.now() - patient.dateOfBirth.getTime()) /
          (365.25 * 24 * 3600 * 1000),
      )
    : null;
  const encounters = await prisma.encounter.findMany({
    where: { patientId: patient.id, deletedAt: null },
    orderBy: { startedAt: "asc" },
    include: {
      consultation: {
        include: { diagnoses: { where: { deletedAt: null } } },
      },
      labOrders: {
        include: { items: { include: { result: true, labTest: true } } },
      },
    },
  });
  console.log(
    JSON.stringify(
      {
        patientNumber: patient.patientNumber,
        name: `${patient.firstName} ${patient.lastName}`,
        dateOfBirth: patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
        ageYears,
        encounterCount: encounters.length,
        visits: encounters.map((e) => ({
          encounterNumber: e.encounterNumber,
          visitNumber: e.visitNumber,
          status: e.status,
          startedAt: e.startedAt.toISOString(),
          assessment: e.consultation?.assessment,
          plan: e.consultation?.plan?.slice(0, 80),
          diagnoses: e.consultation?.diagnoses.map((d) => d.label),
          labs: e.labOrders.map((o) => ({
            orderNumber: o.orderNumber,
            tests: o.items.map((i) => ({
              code: i.labTest.code,
              value: i.result?.value?.slice(0, 100),
            })),
          })),
        })),
      },
      null,
      2,
    ),
  );
}

void main().finally(() => prisma.$disconnect());
