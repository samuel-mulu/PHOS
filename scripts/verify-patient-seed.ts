import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { formatAutoPatientNumber } from "../src/patients/patient-number.util";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const count = await prisma.patient.count({ where: { deletedAt: null } });
  const hcCount = await prisma.patient.count({
    where: { deletedAt: null, patientNumber: { startsWith: "HC" } },
  });
  const sample = await prisma.patient.findMany({
    where: { deletedAt: null, patientNumber: { startsWith: "HC" } },
    take: 5,
    orderBy: { patientNumber: "asc" },
    select: {
      patientNumber: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  });
  const seq = await prisma.$queryRaw<
    Array<{ last_value: bigint; is_called: boolean }>
  >`SELECT last_value, is_called FROM patient_number_seq`;
  const last = Number(seq[0]!.last_value);
  const next = formatAutoPatientNumber(seq[0]!.is_called ? last + 1 : last);
  console.log(
    JSON.stringify(
      {
        count,
        hcCount,
        sample,
        seq: {
          last_value: last,
          is_called: seq[0]!.is_called,
        },
        nextAuto: next,
      },
      null,
      2,
    ),
  );
}

void main().finally(() => prisma.$disconnect());
