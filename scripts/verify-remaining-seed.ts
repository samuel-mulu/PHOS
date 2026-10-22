import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const patient = await prisma.patient.findFirst({
    where: { patientNumber: "HC16946" },
  });
  const triage = patient
    ? await prisma.triage.findFirst({
        where: { encounter: { patientId: patient.id }, deletedAt: null },
        orderBy: { recordedAt: "desc" },
      })
    : null;
  const rx = patient
    ? await prisma.prescription.count({ where: { patientId: patient.id } })
    : 0;
  const inv = patient
    ? await prisma.invoice.count({ where: { patientId: patient.id } })
    : 0;
  const pay = patient
    ? await prisma.payment.count({ where: { patientId: patient.id } })
    : 0;
  const labs = patient
    ? await prisma.labOrder.findMany({
        where: { patientId: patient.id },
        include: {
          items: { include: { labTest: true, result: true } },
        },
        take: 3,
      })
    : [];

  const totals = {
    patients: await prisma.patient.count({ where: { deletedAt: null } }),
    triages: await prisma.triage.count({ where: { deletedAt: null } }),
    prescriptions: await prisma.prescription.count(),
    invoices: await prisma.invoice.count(),
    payments: await prisma.payment.count(),
    appointments: await prisma.appointment.count(),
    medicines: await prisma.medicine.count({ where: { deletedAt: null } }),
  };

  console.log(
    JSON.stringify(
      {
        genet: {
          patientNumber: patient?.patientNumber,
          triage: triage
            ? {
                bp: `${triage.systolic}/${triage.diastolic}`,
                temp: triage.temperature,
                hr: triage.heartRate,
                spo2: triage.spo2,
              }
            : null,
          prescriptions: rx,
          invoices: inv,
          payments: pay,
          labItems: labs.flatMap((l) =>
            l.items.map((i) => ({
              code: i.labTest.code,
              value: i.result?.value?.slice(0, 50),
            })),
          ),
        },
        totals,
      },
      null,
      2,
    ),
  );
}

void main().finally(() => prisma.$disconnect());
