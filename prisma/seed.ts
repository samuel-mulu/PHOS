import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
async function main() {
  const facility = await prisma.facility.upsert({
    where: { code: "PHOS-HQ" },
    update: {},
    create: { code: "PHOS-HQ", name: "PHOS Main Clinic", address: "Ethiopia" },
  });
  const opd = await prisma.department.upsert({
    where: { facilityId_code: { facilityId: facility.id, code: "OPD" } },
    update: {},
    create: { facilityId: facility.id, code: "OPD", name: "General OPD" },
  });
  await prisma.service.upsert({
    where: { departmentId_code: { departmentId: opd.id, code: "CONSULT" } },
    update: {},
    create: {
      departmentId: opd.id,
      code: "CONSULT",
      name: "General Consultation",
      priceCents: 30000,
      durationMinutes: 20,
    },
  });
  for (const test of [
    { code: "CBC", name: "Complete Blood Count", priceCents: 25000 },
    { code: "GLU", name: "Blood Glucose", unit: "mg/dL", priceCents: 12000 },
    { code: "CREAT", name: "Creatinine", unit: "mg/dL", priceCents: 18000 },
  ])
    await prisma.labTest.upsert({
      where: { code: test.code },
      update: {},
      create: test,
    });
  for (const medicine of [
    {
      code: "AMOX500",
      name: "Amoxicillin 500 mg",
      genericName: "Amoxicillin",
      strength: "500 mg",
      form: "Capsule",
      sellingPriceCents: 1200,
      reorderLevel: 100,
    },
    {
      code: "PCM500",
      name: "Paracetamol 500 mg",
      genericName: "Paracetamol",
      strength: "500 mg",
      form: "Tablet",
      sellingPriceCents: 300,
      reorderLevel: 200,
    },
  ])
    await prisma.medicine.upsert({
      where: { code: medicine.code },
      update: {},
      create: medicine,
    });
  const email = (
    process.env.SEED_ADMIN_EMAIL ?? "admin@phos.local"
  ).toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await argon2.hash(password),
      firstName: "System",
      lastName: "Administrator",
      role: "ADMIN",
      status: "ACTIVE",
      departmentId: opd.id,
    },
  });
  console.log(`Seeded PHOS. Admin: ${email}`);
}
void main().finally(() => prisma.$disconnect());
