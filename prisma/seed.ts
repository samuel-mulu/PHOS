import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * Hiwet-style panels (category = pill). Analytes are the paper lines.
 * Panel price sits on the first billed line; other lines in that panel can be 0.
 */
const LAB_TESTS: Array<{
  code: string;
  name: string;
  category: string;
  unit?: string;
  referenceRange?: string;
  priceCents: number;
  sortOrder: number;
  active?: boolean;
}> = [
  { code: "CBC", name: "CBC (legacy package)", category: "CBC", priceCents: 25000, sortOrder: 1, active: false },
  { code: "HGB", name: "Hemoglobin (Hgb)", category: "CBC", unit: "g/dL", referenceRange: "M 13.5-17.5 | F 12.0-15.5", priceCents: 25000, sortOrder: 10 },
  { code: "HCT", name: "Hematocrit (Hct)", category: "CBC", unit: "%", referenceRange: "M 41-50 | F 36-46", priceCents: 0, sortOrder: 11 },
  { code: "RBC", name: "RBC Count", category: "CBC", unit: "x10^6/uL", referenceRange: "4.5-5.9", priceCents: 0, sortOrder: 12 },
  { code: "WBC", name: "WBC Count", category: "CBC", unit: "x10^3/uL", referenceRange: "4.0-11.0", priceCents: 0, sortOrder: 13 },
  { code: "PLT", name: "Platelets", category: "CBC", unit: "x10^3/uL", referenceRange: "150-450", priceCents: 0, sortOrder: 14 },
  { code: "MCV", name: "MCV", category: "CBC", unit: "fL", referenceRange: "80-100", priceCents: 0, sortOrder: 15 },
  { code: "MCH", name: "MCH", category: "CBC", unit: "pg", referenceRange: "27-33", priceCents: 0, sortOrder: 16 },
  { code: "MCHC", name: "MCHC", category: "CBC", unit: "g/dL", referenceRange: "32-36", priceCents: 0, sortOrder: 17 },
  { code: "NEU", name: "Neutrophils", category: "CBC", unit: "%", referenceRange: "40-70", priceCents: 0, sortOrder: 18 },
  { code: "LYM", name: "Lymphocytes", category: "CBC", unit: "%", referenceRange: "20-45", priceCents: 0, sortOrder: 19 },
  { code: "MON", name: "Monocytes", category: "CBC", unit: "%", referenceRange: "2-10", priceCents: 0, sortOrder: 20 },
  { code: "EOS", name: "Eosinophils", category: "CBC", unit: "%", referenceRange: "0-6", priceCents: 0, sortOrder: 21 },
  { code: "BAS", name: "Basophils", category: "CBC", unit: "%", referenceRange: "0-2", priceCents: 0, sortOrder: 22 },
  { code: "MPV", name: "MPV", category: "CBC", unit: "fL", referenceRange: "7.5-11.5", priceCents: 0, sortOrder: 23 },

  { code: "BG", name: "Blood Group", category: "BloodGroup", referenceRange: "A+, A-, B+, B-, AB+, AB-, O+, O-", priceCents: 8000, sortOrder: 30 },

  { code: "UA", name: "Color / Appearance", category: "Urinalysis", priceCents: 10000, sortOrder: 40 },
  { code: "UASG", name: "Specific Gravity", category: "Urinalysis", referenceRange: "1.005-1.030", priceCents: 0, sortOrder: 41 },
  { code: "UAPH", name: "pH", category: "Urinalysis", referenceRange: "4.5-8.0", priceCents: 0, sortOrder: 42 },
  { code: "UAPROT", name: "Protein", category: "Urinalysis", referenceRange: "Negative", priceCents: 0, sortOrder: 43 },
  { code: "UAGLU", name: "Glucose", category: "Urinalysis", referenceRange: "Negative", priceCents: 0, sortOrder: 44 },
  { code: "UAKET", name: "Ketones", category: "Urinalysis", referenceRange: "Negative", priceCents: 0, sortOrder: 45 },

  { code: "HIV", name: "HIV 1/2 Antibody", category: "Serology", referenceRange: "Negative", priceCents: 15000, sortOrder: 50 },
  { code: "HBsAg", name: "Hepatitis B (HBsAg)", category: "Serology", referenceRange: "Negative", priceCents: 15000, sortOrder: 51 },
  { code: "HCV", name: "Hepatitis C (Anti-HCV)", category: "Serology", referenceRange: "Negative", priceCents: 15000, sortOrder: 52 },
  { code: "VDRL", name: "VDRL / RPR", category: "Serology", referenceRange: "Non-Reactive", priceCents: 12000, sortOrder: 53 },

  { code: "GLU", name: "Glucose (Fasting)", category: "BMP", unit: "mg/dL", referenceRange: "70-99", priceCents: 12000, sortOrder: 60 },
  { code: "BUN", name: "BUN", category: "BMP", unit: "mg/dL", referenceRange: "7-20", priceCents: 15000, sortOrder: 61 },
  { code: "CREAT", name: "Creatinine", category: "BMP", unit: "mg/dL", referenceRange: "M 0.7-1.3 | F 0.6-1.1", priceCents: 18000, sortOrder: 62 },
  { code: "NA", name: "Sodium (Na)", category: "BMP", unit: "mEq/L", referenceRange: "135-145", priceCents: 12000, sortOrder: 63 },
  { code: "K", name: "Potassium (K)", category: "BMP", unit: "mEq/L", referenceRange: "3.5-5.0", priceCents: 12000, sortOrder: 64 },

  { code: "ALT", name: "ALT (SGPT)", category: "LFT", unit: "U/L", referenceRange: "7-56", priceCents: 18000, sortOrder: 70 },
  { code: "AST", name: "AST (SGOT)", category: "LFT", unit: "U/L", referenceRange: "10-40", priceCents: 18000, sortOrder: 71 },
  { code: "ALP", name: "Alkaline Phosphatase", category: "LFT", unit: "U/L", referenceRange: "44-147", priceCents: 18000, sortOrder: 72 },
  { code: "GGT", name: "GGT", category: "LFT", unit: "U/L", referenceRange: "9-48", priceCents: 18000, sortOrder: 73 },
  { code: "TBILI", name: "Total Bilirubin", category: "LFT", unit: "mg/dL", referenceRange: "0.1-1.2", priceCents: 15000, sortOrder: 74 },
  { code: "DBILI", name: "Direct Bilirubin", category: "LFT", unit: "mg/dL", referenceRange: "0.0-0.3", priceCents: 15000, sortOrder: 75 },

  { code: "CHOL", name: "Total Cholesterol", category: "Lipid", unit: "mg/dL", referenceRange: "<200", priceCents: 20000, sortOrder: 80 },
  { code: "HDL", name: "HDL Cholesterol", category: "Lipid", unit: "mg/dL", referenceRange: ">60", priceCents: 0, sortOrder: 81 },
  { code: "LDL", name: "LDL Cholesterol", category: "Lipid", unit: "mg/dL", referenceRange: "<100", priceCents: 0, sortOrder: 82 },
  { code: "TG", name: "Triglycerides", category: "Lipid", unit: "mg/dL", referenceRange: "<150", priceCents: 0, sortOrder: 83 },

  { code: "STOOL", name: "Stool for Ova & Parasites", category: "Parasitology", referenceRange: "Negative", priceCents: 10000, sortOrder: 90 },
  { code: "MAL", name: "Malaria Smear", category: "Parasitology", referenceRange: "Negative", priceCents: 10000, sortOrder: 91 },

  { code: "BF", name: "BODY FLUID ANALYSIS", category: "BodyFluid", priceCents: 20000, sortOrder: 100 },
  { code: "AFB", name: "Sputum AFB", category: "Bacteriology", priceCents: 15000, sortOrder: 110 },
  { code: "GRAM", name: "Gram Stain", category: "Bacteriology", priceCents: 10000, sortOrder: 111 },

  { code: "T3", name: "T3", category: "HormoneAnalysis", unit: "uIU/mL", referenceRange: "0.4-4.0", priceCents: 22000, sortOrder: 120 },
  { code: "T4", name: "T4", category: "HormoneAnalysis", unit: "uIU/mL", referenceRange: "0.4-4.0", priceCents: 22000, sortOrder: 121 },
  { code: "TSH", name: "TSH", category: "HormoneAnalysis", unit: "uIU/mL", referenceRange: "0.4-4.0", priceCents: 22000, sortOrder: 122 },
  { code: "FSH", name: "FSH", category: "HormoneAnalysis", unit: "mIU/mL", referenceRange: "1-20", priceCents: 25000, sortOrder: 123 },
  { code: "LH", name: "LH", category: "HormoneAnalysis", unit: "mIU/mL", referenceRange: "1-20", priceCents: 25000, sortOrder: 124 },
  { code: "FT4", name: "Free T4", category: "HormoneAnalysis", unit: "ng/dL", referenceRange: "0.8-1.8", priceCents: 25000, sortOrder: 125 },
  { code: "CORT", name: "Cortisol (AM)", category: "HormoneAnalysis", unit: "ug/dL", referenceRange: "5-23", priceCents: 28000, sortOrder: 126 },
  { code: "TESTO", name: "Testosterone (Male)", category: "HormoneAnalysis", unit: "ng/dL", referenceRange: "300-1000", priceCents: 30000, sortOrder: 127 },
  { code: "EST", name: "Estrogen (Female)", category: "HormoneAnalysis", unit: "pg/mL", referenceRange: "15-350", priceCents: 30000, sortOrder: 128 },
  { code: "PROG", name: "Progesterone (Female)", category: "HormoneAnalysis", unit: "ng/mL", referenceRange: "5-20", priceCents: 30000, sortOrder: 129 },
  { code: "LHFSH", name: "LH / FSH", category: "HormoneAnalysis", unit: "mIU/mL", referenceRange: "1-20", priceCents: 40000, sortOrder: 130 },
  { code: "BHCG", name: "Serum B HCG", category: "HormoneAnalysis", unit: "mIU/mL", priceCents: 25000, sortOrder: 131 },

  { code: "VITD", name: "Vitamin D", category: "OtherPanels", unit: "ng/mL", referenceRange: "30-100", priceCents: 35000, sortOrder: 140 },
  { code: "HBA1C", name: "HbA1c (Glycated Hb)", category: "OtherPanels", unit: "%", referenceRange: "<5.7", priceCents: 28000, sortOrder: 141 },
  { code: "OTHER", name: "Other (specify in notes)", category: "OtherPanels", priceCents: 0, sortOrder: 999 },
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
        ...(test.active === false ? { active: false } : {}),
      },
      create: {
        code: test.code,
        name: test.name,
        category: test.category,
        unit: test.unit ?? null,
        referenceRange: test.referenceRange ?? null,
        priceCents: test.priceCents,
        sortOrder: test.sortOrder,
        active: test.active !== false,
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
