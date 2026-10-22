/**
 * Load clean PHOS seed-data into Postgres.
 * Run after catalog seed: npm run prisma:seed && npm run prisma:seed:prod
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  Sex,
  type Prisma,
} from "../src/generated/prisma/client";
import {
  isSanePatientNumberNumeric,
  parsePatientNumberNumeric,
} from "../src/patients/patient-number.util";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type SeedPatient = {
  id: string;
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

type SeedEncounter = {
  id: string;
  patientId: string;
  encounterNumber: string;
  visitNumber: number;
  type: "WALK_IN";
  status: "COMPLETED";
  priority: "ROUTINE";
  reason?: string;
  startedAt: string;
  closedAt: string;
  departmentCode: string;
  serviceCode?: string;
};

type SeedConsultation = {
  id: string;
  encounterId: string;
  patientId: string;
  chiefComplaint?: string;
  assessment?: string;
  plan?: string;
  notes?: string;
  status: "FINALIZED";
  finalizedAt: string;
  diagnosisLabel?: string;
};

type SeedLabOrder = {
  id: string;
  orderNumber: string;
  encounterId: string;
  consultationId: string;
  patientId: string;
  clinicalNotes?: string;
  createdAt: string;
  labTestCode: string;
  resultValue: string;
  resultNotes?: string;
  items?: Array<{
    labTestCode: string;
    value: string;
    unit?: string;
    label?: string;
  }>;
};

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function optionalJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return loadJson<T>(filePath);
}

function uuidFromNamespace(ns: string, key: string): string {
  const hash = createHash("sha256").update(`${ns}:${key}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function main() {
  const seedDir = path.join(__dirname, "seed-data");
  const patientsPath = path.join(seedDir, "patients.json");
  if (!fs.existsSync(patientsPath)) {
    throw new Error(
      `Missing ${patientsPath}. Run: npm run firebase:to-seed`,
    );
  }

  const deskEmail = (
    process.env.SEED_DESK_EMAIL ?? "desk@phos.local"
  ).toLowerCase();
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL ?? "admin@phos.local"
  ).toLowerCase();

  const desk = await prisma.user.findUnique({ where: { email: deskEmail } });
  if (!desk) {
    throw new Error(
      `Front-desk user ${deskEmail} not found. Run npm run prisma:seed first.`,
    );
  }
  const admin =
    (await prisma.user.findUnique({ where: { email: adminEmail } })) ?? desk;

  const facility = await prisma.facility.findUnique({
    where: { code: "PHOS-HQ" },
  });
  if (!facility) {
    throw new Error("Facility PHOS-HQ missing. Run npm run prisma:seed first.");
  }
  const opd = await prisma.department.findUnique({
    where: {
      facilityId_code: { facilityId: facility.id, code: "OPD" },
    },
  });
  if (!opd) {
    throw new Error("Department OPD missing. Run npm run prisma:seed first.");
  }

  const services = await prisma.service.findMany({
    where: { departmentId: opd.id, deletedAt: null },
    select: { id: true, code: true },
  });
  const serviceByCode = new Map(services.map((s) => [s.code, s.id]));

  const labTests = await prisma.labTest.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, priceCents: true },
  });
  const labTestByCode = new Map(labTests.map((t) => [t.code, t]));
  const otherLab = labTestByCode.get("OTHER");
  if (!otherLab) {
    throw new Error("Lab test OTHER missing. Run npm run prisma:seed first.");
  }

  // Resolve patientNumber → actual DB id (upsert may keep existing uuid)
  const patientIdBySeedId = new Map<string, string>();

  const patients = loadJson<SeedPatient[]>(patientsPath);
  console.log(`Seeding ${patients.length} patients…`);

  let upsertedPatients = 0;
  let maxSane = 0;
  const BATCH = 40;

  for (let i = 0; i < patients.length; i += BATCH) {
    const chunk = patients.slice(i, i + BATCH);
    for (const p of chunk) {
      const dateOfBirth =
        p.dateOfBirth && p.dateOfBirth.trim()
          ? new Date(p.dateOfBirth)
          : null;
      const createdAt = p.createdAt ? new Date(p.createdAt) : undefined;
      const n = parsePatientNumberNumeric(p.patientNumber);
      if (n != null && isSanePatientNumberNumeric(n) && n > maxSane) {
        maxSane = n;
      }

      const row = await prisma.patient.upsert({
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
        select: { id: true },
      });
      patientIdBySeedId.set(p.id, row.id);
      upsertedPatients += 1;
    }
    if ((i / BATCH) % 5 === 0 || i + BATCH >= patients.length) {
      console.log(
        `  patients … ${Math.min(i + BATCH, patients.length)}/${patients.length}`,
      );
    }
  }

  if (maxSane > 0) {
    await prisma.$executeRawUnsafe(
      `SELECT setval('patient_number_seq', ${maxSane}, true)`,
    );
  }

  const encounters =
    optionalJson<SeedEncounter[]>(path.join(seedDir, "encounters.json")) ?? [];
  const consultations =
    optionalJson<SeedConsultation[]>(
      path.join(seedDir, "consultations.json"),
    ) ?? [];
  const labOrders =
    optionalJson<SeedLabOrder[]>(path.join(seedDir, "lab-orders.json")) ?? [];

  console.log(
    `Seeding encounters=${encounters.length}, consultations=${consultations.length}, labs=${labOrders.length}…`,
  );

  let upsertedEncounters = 0;
  const ENC_BATCH = 15;
  for (let i = 0; i < encounters.length; i += ENC_BATCH) {
    const chunk = encounters.slice(i, i + ENC_BATCH);
    await prisma.$transaction(
      async (tx) => {
        for (const e of chunk) {
          const patientId = patientIdBySeedId.get(e.patientId) ?? e.patientId;
          const serviceId = e.serviceCode
            ? (serviceByCode.get(e.serviceCode) ?? null)
            : null;
          const startedAt = new Date(e.startedAt);
          const closedAt = new Date(e.closedAt);
          const data = {
            patientId,
            facilityId: facility.id,
            departmentId: opd.id,
            serviceId,
            visitNumber: e.visitNumber,
            type: e.type,
            status: e.status,
            priority: e.priority,
            reason: e.reason ?? null,
            startedAt: Number.isNaN(startedAt.getTime())
              ? new Date()
              : startedAt,
            closedAt: Number.isNaN(closedAt.getTime()) ? null : closedAt,
            createdById: desk.id,
            deletedAt: null,
          } satisfies Prisma.EncounterUncheckedUpdateInput;
          await tx.encounter.upsert({
            where: { encounterNumber: e.encounterNumber },
            update: data,
            create: {
              id: e.id,
              encounterNumber: e.encounterNumber,
              ...data,
            },
          });
        }
      },
      { timeout: 60_000, maxWait: 20_000 },
    );
    upsertedEncounters += chunk.length;
    if ((i / ENC_BATCH) % 20 === 0 || i + ENC_BATCH >= encounters.length) {
      console.log(
        `  encounters … ${Math.min(i + ENC_BATCH, encounters.length)}/${encounters.length}`,
      );
    }
  }

  // Map seed encounter id → DB id via encounterNumber
  const encounterRows = await prisma.encounter.findMany({
    where: {
      encounterNumber: { in: encounters.map((e) => e.encounterNumber) },
    },
    select: { id: true, encounterNumber: true },
  });
  const encounterIdByNumber = new Map(
    encounterRows.map((r) => [r.encounterNumber, r.id]),
  );
  const encounterIdBySeedId = new Map<string, string>();
  for (const e of encounters) {
    const dbId = encounterIdByNumber.get(e.encounterNumber);
    if (dbId) encounterIdBySeedId.set(e.id, dbId);
  }

  let upsertedConsults = 0;
  for (let i = 0; i < consultations.length; i += BATCH) {
    const chunk = consultations.slice(i, i + BATCH);
    for (const c of chunk) {
      const encounterId =
        encounterIdBySeedId.get(c.encounterId) ?? c.encounterId;
      const finalizedAt = new Date(c.finalizedAt);
      const consult = await prisma.consultation.upsert({
        where: { encounterId },
        update: {
          doctorId: admin.id,
          chiefComplaint: c.chiefComplaint ?? null,
          assessment: c.assessment ?? null,
          plan: c.plan ?? null,
          notes: c.notes ?? null,
          status: c.status,
          finalizedAt: Number.isNaN(finalizedAt.getTime())
            ? new Date()
            : finalizedAt,
          deletedAt: null,
        },
        create: {
          id: c.id,
          encounterId,
          doctorId: admin.id,
          chiefComplaint: c.chiefComplaint ?? null,
          assessment: c.assessment ?? null,
          plan: c.plan ?? null,
          notes: c.notes ?? null,
          status: c.status,
          finalizedAt: Number.isNaN(finalizedAt.getTime())
            ? new Date()
            : finalizedAt,
        },
      });
      upsertedConsults += 1;

      if (c.diagnosisLabel?.trim()) {
        const dxId = uuidFromNamespace("phos-dx", c.id);
        const existing = await prisma.diagnosis.findFirst({
          where: { consultationId: consult.id, deletedAt: null },
          select: { id: true },
        });
        if (existing) {
          await prisma.diagnosis.update({
            where: { id: existing.id },
            data: {
              label: c.diagnosisLabel.trim().slice(0, 500),
              type: "PROVISIONAL",
              isPrimary: true,
            },
          });
        } else {
          await prisma.diagnosis.create({
            data: {
              id: dxId,
              consultationId: consult.id,
              label: c.diagnosisLabel.trim().slice(0, 500),
              type: "PROVISIONAL",
              isPrimary: true,
              createdById: admin.id,
            },
          });
        }
      }
    }
    if ((i / BATCH) % 10 === 0 || i + BATCH >= consultations.length) {
      console.log(
        `  consultations … ${Math.min(i + BATCH, consultations.length)}/${consultations.length}`,
      );
    }
  }

  const consultByEncounter = new Map(
    (
      await prisma.consultation.findMany({
        where: {
          encounterId: { in: [...encounterIdBySeedId.values()] },
        },
        select: { id: true, encounterId: true },
      })
    ).map((c) => [c.encounterId, c.id]),
  );

  let upsertedLabs = 0;
  for (let i = 0; i < labOrders.length; i += BATCH) {
    const chunk = labOrders.slice(i, i + BATCH);
    for (const lo of chunk) {
      const patientId = patientIdBySeedId.get(lo.patientId) ?? lo.patientId;
      const encounterId =
        encounterIdBySeedId.get(lo.encounterId) ?? lo.encounterId;
      const consultationId =
        consultByEncounter.get(encounterId) ?? lo.consultationId;
      const createdAt = new Date(lo.createdAt);

      const order = await prisma.labOrder.upsert({
        where: { orderNumber: lo.orderNumber },
        update: {
          consultationId,
          encounterId,
          patientId,
          doctorId: admin.id,
          status: "VERIFIED",
          priority: "ROUTINE",
          clinicalNotes: lo.clinicalNotes ?? null,
        },
        create: {
          id: lo.id,
          orderNumber: lo.orderNumber,
          consultationId,
          encounterId,
          patientId,
          doctorId: admin.id,
          status: "VERIFIED",
          priority: "ROUTINE",
          clinicalNotes: lo.clinicalNotes ?? null,
          ...(Number.isNaN(createdAt.getTime()) ? {} : { createdAt }),
        },
      });

      const lineItems =
        lo.items?.length ?
          lo.items
        : [{ labTestCode: lo.labTestCode, value: lo.resultValue }];

      // Deduplicate by labTestCode within one order (unique constraint)
      const seenCodes = new Set<string>();
      for (const line of lineItems) {
        let code = line.labTestCode || "OTHER";
        if (seenCodes.has(code)) code = "OTHER";
        if (seenCodes.has(code) && code === "OTHER") {
          // keep full text on first OTHER only
          continue;
        }
        seenCodes.add(code);
        const labTest = labTestByCode.get(code) ?? otherLab;

        let item = await prisma.labOrderItem.findUnique({
          where: {
            labOrderId_labTestId: {
              labOrderId: order.id,
              labTestId: labTest.id,
            },
          },
          include: { result: true },
        });
        if (!item) {
          item = await prisma.labOrderItem.create({
            data: {
              labOrderId: order.id,
              labTestId: labTest.id,
              priceCents: labTest.priceCents,
            },
            include: { result: true },
          });
        }

        const resultValue = (line.value || lo.resultValue || "").slice(0, 20000);
        const notes = [lo.resultNotes, line.label, line.unit]
          .filter(Boolean)
          .join(" · ") || null;
        if (item.result) {
          await prisma.labResult.update({
            where: { id: item.result.id },
            data: {
              value: resultValue,
              unit: line.unit ?? null,
              notes,
              flag: "NORMAL",
              verifiedById: admin.id,
              verifiedAt: Number.isNaN(createdAt.getTime())
                ? new Date()
                : createdAt,
            },
          });
        } else {
          await prisma.labResult.create({
            data: {
              labOrderItemId: item.id,
              value: resultValue,
              unit: line.unit ?? null,
              notes,
              flag: "NORMAL",
              enteredById: admin.id,
              verifiedById: admin.id,
              enteredAt: Number.isNaN(createdAt.getTime())
                ? new Date()
                : createdAt,
              verifiedAt: Number.isNaN(createdAt.getTime())
                ? new Date()
                : createdAt,
            },
          });
        }
      }
      upsertedLabs += 1;
    }
    if ((i / BATCH) % 10 === 0 || i + BATCH >= labOrders.length) {
      console.log(
        `  labs … ${Math.min(i + BATCH, labOrders.length)}/${labOrders.length}`,
      );
    }
  }

  // --- Triage ---
  type SeedTriage = {
    encounterId: string;
    temperature?: number;
    systolic?: number;
    diastolic?: number;
    heartRate?: number;
    respiratoryRate?: number;
    spo2?: number;
    weightKg?: number;
    heightCm?: number;
    painScore?: number;
    bloodGlucoseMgDl?: number;
    notes?: string;
    recordedAt: string;
  };
  const triages =
    optionalJson<SeedTriage[]>(path.join(seedDir, "triages.json")) ?? [];
  let upsertedTriages = 0;
  for (const t of triages) {
    const encounterId =
      encounterIdBySeedId.get(t.encounterId) ?? t.encounterId;
    const recordedAt = new Date(t.recordedAt);
    await prisma.triage.upsert({
      where: { encounterId },
      update: {
        temperature: t.temperature ?? null,
        systolic: t.systolic ?? null,
        diastolic: t.diastolic ?? null,
        heartRate: t.heartRate ?? null,
        respiratoryRate: t.respiratoryRate ?? null,
        spo2: t.spo2 ?? null,
        weightKg: t.weightKg ?? null,
        heightCm: t.heightCm ?? null,
        painScore: t.painScore ?? null,
        bloodGlucoseMgDl: t.bloodGlucoseMgDl ?? null,
        notes: t.notes ?? null,
        recordedById: desk.id,
        recordedAt: Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt,
        deletedAt: null,
      },
      create: {
        encounterId,
        temperature: t.temperature ?? null,
        systolic: t.systolic ?? null,
        diastolic: t.diastolic ?? null,
        heartRate: t.heartRate ?? null,
        respiratoryRate: t.respiratoryRate ?? null,
        spo2: t.spo2 ?? null,
        weightKg: t.weightKg ?? null,
        heightCm: t.heightCm ?? null,
        painScore: t.painScore ?? null,
        bloodGlucoseMgDl: t.bloodGlucoseMgDl ?? null,
        notes: t.notes ?? null,
        recordedById: desk.id,
        recordedAt: Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt,
      },
    });
    upsertedTriages += 1;
  }
  console.log(`  triages … ${upsertedTriages}`);

  // --- Medicines from Rx parse ---
  type SeedMedicine = {
    code: string;
    name: string;
    sellingPriceCents: number;
  };
  const medicines =
    optionalJson<SeedMedicine[]>(path.join(seedDir, "medicines.json")) ?? [];
  for (const m of medicines) {
    await prisma.medicine.upsert({
      where: { code: m.code },
      update: { name: m.name, deletedAt: null, active: true },
      create: {
        code: m.code,
        name: m.name,
        sellingPriceCents: m.sellingPriceCents || 0,
        reorderLevel: 0,
        active: true,
      },
    });
  }
  const medicineByCode = new Map(
    (
      await prisma.medicine.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true },
      })
    ).map((m) => [m.code, m.id]),
  );
  console.log(`  medicines … ${medicines.length}`);

  // --- Prescriptions ---
  type SeedRx = {
    id: string;
    prescriptionNumber: string;
    encounterId: string;
    consultationId: string;
    patientId: string;
    notes?: string;
    createdAt: string;
    items: Array<{
      medicineCode: string;
      dose: string;
      route: string;
      frequency: string;
      duration: string;
      quantity: number;
      instructions?: string;
    }>;
  };
  const prescriptions =
    optionalJson<SeedRx[]>(path.join(seedDir, "prescriptions.json")) ?? [];
  let upsertedRx = 0;
  for (const rx of prescriptions) {
    const patientId = patientIdBySeedId.get(rx.patientId) ?? rx.patientId;
    const encounterId =
      encounterIdBySeedId.get(rx.encounterId) ?? rx.encounterId;
    const consultationId =
      consultByEncounter.get(encounterId) ?? rx.consultationId;
    const createdAt = new Date(rx.createdAt);
    const row = await prisma.prescription.upsert({
      where: { prescriptionNumber: rx.prescriptionNumber },
      update: {
        consultationId,
        encounterId,
        patientId,
        doctorId: admin.id,
        status: "ACTIVE",
        notes: rx.notes ?? null,
      },
      create: {
        id: rx.id,
        prescriptionNumber: rx.prescriptionNumber,
        consultationId,
        encounterId,
        patientId,
        doctorId: admin.id,
        status: "ACTIVE",
        notes: rx.notes ?? null,
        ...(Number.isNaN(createdAt.getTime()) ? {} : { createdAt }),
      },
    });
    await prisma.prescriptionItem.deleteMany({
      where: { prescriptionId: row.id },
    });
    for (const it of rx.items) {
      const medicineId = medicineByCode.get(it.medicineCode);
      if (!medicineId) continue;
      await prisma.prescriptionItem.create({
        data: {
          prescriptionId: row.id,
          medicineId,
          dose: it.dose.slice(0, 120),
          route: it.route.slice(0, 40),
          frequency: it.frequency.slice(0, 40),
          duration: it.duration.slice(0, 80),
          quantity: Math.max(1, it.quantity || 1),
          instructions: it.instructions?.slice(0, 500) ?? null,
        },
      });
    }
    upsertedRx += 1;
  }
  console.log(`  prescriptions … ${upsertedRx}`);

  // --- Invoices ---
  type SeedInvoice = {
    id: string;
    invoiceNumber: string;
    encounterId: string;
    patientId: string;
    status: "ISSUED" | "PAID" | "DRAFT";
    subtotalCents: number;
    totalCents: number;
    paidCents: number;
    issuedAt: string;
    items: Array<{
      type: "CONSULTATION" | "LAB" | "MEDICINE" | "PROCEDURE" | "OTHER";
      description: string;
      quantity: number;
      unitPriceCents: number;
      totalCents: number;
    }>;
  };
  const invoices =
    optionalJson<SeedInvoice[]>(path.join(seedDir, "invoices.json")) ?? [];
  const invoiceIdBySeedId = new Map<string, string>();
  let upsertedInvoices = 0;
  for (const inv of invoices) {
    const patientId = patientIdBySeedId.get(inv.patientId) ?? inv.patientId;
    const encounterId =
      encounterIdBySeedId.get(inv.encounterId) ?? inv.encounterId;
    const issuedAt = new Date(inv.issuedAt);
    try {
      const row = await prisma.invoice.upsert({
        where: { invoiceNumber: inv.invoiceNumber },
        update: {
          patientId,
          status: inv.status,
          subtotalCents: inv.subtotalCents,
          totalCents: inv.totalCents,
          paidCents: inv.paidCents,
          issuedById: desk.id,
          issuedAt: Number.isNaN(issuedAt.getTime()) ? new Date() : issuedAt,
        },
        create: {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          encounterId,
          patientId,
          status: inv.status,
          subtotalCents: inv.subtotalCents,
          discountCents: 0,
          totalCents: inv.totalCents,
          paidCents: inv.paidCents,
          issuedById: desk.id,
          issuedAt: Number.isNaN(issuedAt.getTime()) ? new Date() : issuedAt,
        },
      });
      invoiceIdBySeedId.set(inv.id, row.id);
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: row.id } });
      for (const it of inv.items) {
        await prisma.invoiceItem.create({
          data: {
            invoiceId: row.id,
            type: it.type,
            description: it.description.slice(0, 300),
            quantity: it.quantity || 1,
            unitPriceCents: it.unitPriceCents,
            totalCents: it.totalCents,
          },
        });
      }
      upsertedInvoices += 1;
    } catch (err) {
      // encounter may already have another invoice (desk-created)
      console.warn(
        `  skip invoice ${inv.invoiceNumber}: ${(err as Error).message?.slice(0, 120)}`,
      );
    }
  }
  console.log(`  invoices … ${upsertedInvoices}`);

  // --- Payments ---
  type SeedPayment = {
    id: string;
    paymentNumber: string;
    invoiceId: string;
    patientId: string;
    amountCents: number;
    method: "CASH" | "CARD" | "TELEBIRR" | "BANK_TRANSFER" | "INSURANCE" | "OTHER";
    status: "COMPLETED";
    referenceNumber?: string;
    idempotencyKey: string;
    createdAt: string;
  };
  const payments =
    optionalJson<SeedPayment[]>(path.join(seedDir, "payments.json")) ?? [];
  let upsertedPayments = 0;
  for (const pay of payments) {
    const patientId = patientIdBySeedId.get(pay.patientId) ?? pay.patientId;
    const invoiceId =
      invoiceIdBySeedId.get(pay.invoiceId) ?? pay.invoiceId;
    const createdAt = new Date(pay.createdAt);
    try {
      await prisma.payment.upsert({
        where: { idempotencyKey: pay.idempotencyKey },
        update: {
          amountCents: pay.amountCents,
          method: pay.method,
          status: pay.status,
          referenceNumber: pay.referenceNumber ?? null,
        },
        create: {
          id: pay.id,
          paymentNumber: pay.paymentNumber,
          invoiceId,
          patientId,
          amountCents: pay.amountCents,
          method: pay.method,
          status: pay.status,
          referenceNumber: pay.referenceNumber ?? null,
          idempotencyKey: pay.idempotencyKey,
          recordedById: desk.id,
          ...(Number.isNaN(createdAt.getTime()) ? {} : { createdAt }),
        },
      });
      upsertedPayments += 1;
    } catch (err) {
      console.warn(
        `  skip payment ${pay.paymentNumber}: ${(err as Error).message?.slice(0, 120)}`,
      );
    }
  }
  console.log(`  payments … ${upsertedPayments}`);

  // --- Appointments ---
  type SeedAppt = {
    id: string;
    patientId: string;
    scheduledAt: string;
    status: "SCHEDULED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
    serviceCode?: string;
    notes?: string;
  };
  const appointments =
    optionalJson<SeedAppt[]>(path.join(seedDir, "appointments.json")) ?? [];
  let upsertedAppts = 0;
  for (const a of appointments) {
    const patientId = patientIdBySeedId.get(a.patientId) ?? a.patientId;
    const serviceId = a.serviceCode
      ? (serviceByCode.get(a.serviceCode) ?? null)
      : null;
    const scheduledAt = new Date(a.scheduledAt);
    // appointments have no unique business key besides id — upsert by id
    await prisma.appointment.upsert({
      where: { id: a.id },
      update: {
        patientId,
        scheduledAt: Number.isNaN(scheduledAt.getTime())
          ? new Date()
          : scheduledAt,
        status: a.status,
        departmentId: opd.id,
        serviceId,
        notes: a.notes ?? null,
      },
      create: {
        id: a.id,
        patientId,
        scheduledAt: Number.isNaN(scheduledAt.getTime())
          ? new Date()
          : scheduledAt,
        status: a.status,
        departmentId: opd.id,
        serviceId,
        notes: a.notes ?? null,
        createdById: desk.id,
      },
    });
    upsertedAppts += 1;
  }
  console.log(`  appointments … ${upsertedAppts}`);

  const patientCount = await prisma.patient.count({
    where: { deletedAt: null },
  });
  const encounterCount = await prisma.encounter.count({
    where: { deletedAt: null },
  });
  const labCount = await prisma.labOrder.count();
  const invoiceCount = await prisma.invoice.count();
  const paymentCount = await prisma.payment.count();

  console.log(
    `Production seed done. patients=${upsertedPatients} (db=${patientCount}), encounters=${upsertedEncounters} (db=${encounterCount}), consultations=${upsertedConsults}, labs=${upsertedLabs} (db=${labCount}), triages=${upsertedTriages}, rx=${upsertedRx}, invoices=${upsertedInvoices} (db=${invoiceCount}), payments=${upsertedPayments} (db=${paymentCount}), appts=${upsertedAppts}. Sequence HC max sane=${maxSane} → next HC${(maxSane + 1).toString().padStart(6, "0")}.`,
  );
}

void main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
