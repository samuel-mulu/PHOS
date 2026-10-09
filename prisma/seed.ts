import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Default orderable lab menu — admin can turn off/on and add more later. */
const LAB_TESTS: Array<{
  code: string;
  name: string;
  category: string;
  unit?: string;
  referenceRange?: string;
  priceCents: number;
  sortOrder: number;
}> = [
  { code: "CBC", name: "CBC", category: "Hematology", priceCents: 25000, sortOrder: 10 },
  { code: "BG", name: "BLOOD Group", category: "Hematology", priceCents: 8000, sortOrder: 20 },
  { code: "UA", name: "URINALYSIS", category: "Urine", priceCents: 10000, sortOrder: 30 },
  { code: "HIV", name: "HIV 1/2 Antibody", category: "Serology", priceCents: 15000, sortOrder: 40 },
  { code: "HBsAg", name: "Hepatitis B (HBsAg)", category: "Serology", priceCents: 15000, sortOrder: 50 },
  { code: "HCV", name: "Hepatitis C (Anti-HCV)", category: "Serology", priceCents: 15000, sortOrder: 60 },
  { code: "VDRL", name: "VDRL / RPR", category: "Serology", priceCents: 12000, sortOrder: 70 },
  {
    code: "GLU",
    name: "Glucose (RBS/FBS)",
    category: "Chemistry",
    unit: "mg/dL",
    priceCents: 12000,
    sortOrder: 80,
  },
  {
    code: "STOOL",
    name: "Stool for Ova & Parasites",
    category: "Microbiology",
    priceCents: 10000,
    sortOrder: 90,
  },
  { code: "MAL", name: "Malaria Smear", category: "Microbiology", priceCents: 10000, sortOrder: 100 },
  {
    code: "BUN",
    name: "BUN",
    category: "Chemistry",
    unit: "mg/dL",
    priceCents: 15000,
    sortOrder: 110,
  },
  {
    code: "CREAT",
    name: "Creatinine",
    category: "Chemistry",
    unit: "mg/dL",
    priceCents: 18000,
    sortOrder: 120,
  },
  {
    code: "ALT",
    name: "ALT (SGPT)",
    category: "Chemistry",
    unit: "U/L",
    priceCents: 18000,
    sortOrder: 130,
  },
  {
    code: "AST",
    name: "AST (SGOT)",
    category: "Chemistry",
    unit: "U/L",
    priceCents: 18000,
    sortOrder: 140,
  },
  {
    code: "ALP",
    name: "Alkaline Phosphatase",
    category: "Chemistry",
    unit: "U/L",
    priceCents: 18000,
    sortOrder: 150,
  },
  {
    code: "BF",
    name: "BODY FLUID ANALYSIS",
    category: "Microbiology",
    priceCents: 20000,
    sortOrder: 160,
  },
  { code: "AFB", name: "Sputum AFB", category: "Microbiology", priceCents: 15000, sortOrder: 170 },
  { code: "GRAM", name: "Gram Stain", category: "Microbiology", priceCents: 10000, sortOrder: 180 },
  { code: "T3", name: "T3", category: "Hormones", priceCents: 22000, sortOrder: 190 },
  { code: "T4", name: "T4", category: "Hormones", priceCents: 22000, sortOrder: 200 },
  { code: "TSH", name: "TSH", category: "Hormones", priceCents: 22000, sortOrder: 210 },
  { code: "FSH", name: "FSH", category: "Hormones", priceCents: 25000, sortOrder: 220 },
  { code: "LH", name: "LH", category: "Hormones", priceCents: 25000, sortOrder: 230 },
  { code: "FT4", name: "Free T4", category: "Hormones", priceCents: 25000, sortOrder: 240 },
  { code: "CORT", name: "Cortisol (AM)", category: "Hormones", priceCents: 28000, sortOrder: 250 },
  {
    code: "TESTO",
    name: "Testosterone (Male)",
    category: "Hormones",
    priceCents: 30000,
    sortOrder: 260,
  },
  {
    code: "EST",
    name: "Estrogen (Female)",
    category: "Hormones",
    priceCents: 30000,
    sortOrder: 270,
  },
  {
    code: "PROG",
    name: "Progesterone (Female)",
    category: "Hormones",
    priceCents: 30000,
    sortOrder: 280,
  },
  { code: "LHFSH", name: "LH / FSH", category: "Hormones", priceCents: 40000, sortOrder: 290 },
  { code: "BHCG", name: "Serum B HCG", category: "Hormones", priceCents: 25000, sortOrder: 300 },
  { code: "VITD", name: "Vitamin D", category: "Chemistry", priceCents: 35000, sortOrder: 310 },
  {
    code: "HBA1C",
    name: "HbA1c (Glycated Hb)",
    category: "Chemistry",
    unit: "%",
    priceCents: 28000,
    sortOrder: 320,
  },
  {
    code: "OTHER",
    name: "Other (specify in notes)",
    category: "Other",
    priceCents: 0,
    sortOrder: 999,
  },
];

/** Top clinic services — optional fees (desk may start visit with none). Admin can edit prices. */
const CLINIC_SERVICES: Array<{
  code: string;
  name: string;
  priceCents: number;
  durationMinutes?: number;
}> = [
  {
    code: "EMERG",
    name: "Emergency Care Services",
    priceCents: 50000,
    durationMinutes: 30,
  },
  {
    code: "OPD",
    name: "Outpatient Services (Pediatric & Adult Care)",
    priceCents: 30000,
    durationMinutes: 20,
  },
  {
    code: "MCH",
    name: "Maternal & Child Health (MCH) Services",
    priceCents: 35000,
    durationMinutes: 25,
  },
  {
    code: "PNC",
    name: "Delivery & Postnatal Care (PNC)",
    priceCents: 150000,
    durationMinutes: 60,
  },
  {
    code: "FP",
    name: "Family Planning & Reproductive Health Services",
    priceCents: 25000,
    durationMinutes: 20,
  },
  {
    code: "MINOR_SURG",
    name: "Minor Surgical Procedures",
    priceCents: 80000,
    durationMinutes: 45,
  },
  {
    code: "CLINIC_LAB",
    name: "Comprehensive Laboratory Services",
    priceCents: 0,
    durationMinutes: 15,
  },
  {
    code: "USG",
    name: "Ultrasound & Diagnostic Imaging",
    priceCents: 60000,
    durationMinutes: 30,
  },
  {
    code: "WOUND",
    name: "Wound Care & Injection Services",
    priceCents: 15000,
    durationMinutes: 15,
  },
  {
    code: "REFERRAL",
    name: "Referral & Follow-Up Care",
    priceCents: 20000,
    durationMinutes: 15,
  },
  // Keep legacy consultation for existing desks
  {
    code: "CONSULT",
    name: "General Consultation",
    priceCents: 30000,
    durationMinutes: 20,
  },
  { code: "REG", name: "Registration fee", priceCents: 5000 },
];

async function main() {
  const facility = await prisma.facility.upsert({
    where: { code: "PHOS-HQ" },
    update: { name: "Hiwet Clinic" },
    create: {
      code: "PHOS-HQ",
      name: "Hiwet Clinic",
      address: "Ethiopia",
    },
  });
  const opd = await prisma.department.upsert({
    where: { facilityId_code: { facilityId: facility.id, code: "OPD" } },
    update: { name: "General OPD" },
    create: { facilityId: facility.id, code: "OPD", name: "General OPD" },
  });

  for (const svc of CLINIC_SERVICES) {
    await prisma.service.upsert({
      where: {
        departmentId_code: { departmentId: opd.id, code: svc.code },
      },
      update: {
        name: svc.name,
        durationMinutes: svc.durationMinutes ?? null,
        deletedAt: null,
        // Preserve admin-edited prices on re-seed
      },
      create: {
        departmentId: opd.id,
        code: svc.code,
        name: svc.name,
        priceCents: svc.priceCents,
        durationMinutes: svc.durationMinutes ?? null,
        active: true,
      },
    });
  }

  for (const test of LAB_TESTS) {
    await prisma.labTest.upsert({
      where: { code: test.code },
      update: {
        name: test.name,
        category: test.category,
        unit: test.unit ?? null,
        referenceRange: test.referenceRange ?? null,
        sortOrder: test.sortOrder,
        deletedAt: null,
        // Preserve admin price/active toggles on re-seed
      },
      create: {
        code: test.code,
        name: test.name,
        category: test.category,
        unit: test.unit ?? null,
        referenceRange: test.referenceRange ?? null,
        priceCents: test.priceCents,
        sortOrder: test.sortOrder,
        active: true,
      },
    });
  }

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
  const deskEmail = (
    process.env.SEED_DESK_EMAIL ?? "desk@phos.local"
  ).toLowerCase();
  const deskPassword = process.env.SEED_DESK_PASSWORD ?? password;
  await prisma.user.upsert({
    where: { email: deskEmail },
    update: { role: "FRONT_DESK", status: "ACTIVE" },
    create: {
      email: deskEmail,
      passwordHash: await argon2.hash(deskPassword),
      firstName: "Front",
      lastName: "Desk",
      role: "FRONT_DESK",
      status: "ACTIVE",
      departmentId: opd.id,
    },
  });
  console.log(
    `Seeded Hiwet Clinic. Services: ${CLINIC_SERVICES.length}. Lab tests: ${LAB_TESTS.length}. Admin: ${email} · Front desk: ${deskEmail}`,
  );
}
void main().finally(() => prisma.$disconnect());
