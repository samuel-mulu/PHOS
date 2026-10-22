/**
 * Build triage, appointments, FP service events, billing, deeper labs, Rx
 * on top of patients/encounters already written by firebase-to-seed-data.ts.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  mapApptServiceCode,
  mapAppointmentStatus,
  mapInvoiceItemType,
  mapPaymentMethod,
  parseBp,
  parseLabAnalytes,
  parseNum,
  parsePrescriptionLines,
  toCents,
} from "./lib/seed-parsers";

function uuidFromNamespace(ns: string, key: string): string {
  const hash = createHash("sha256").update(`${ns}:${key}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function shortHash(key: string): string {
  return createHash("sha1").update(key).digest("hex").slice(0, 10).toUpperCase();
}

type SeedPatient = {
  id: string;
  firebaseKey: string;
  patientNumber: string;
  createdAt?: string;
  serviceLabels?: string[];
};

type SeedEncounter = {
  id: string;
  firebaseVisitKey: string;
  patientId: string;
  encounterNumber: string;
  visitNumber: number;
  startedAt: string;
  closedAt: string;
  departmentCode: string;
  serviceCode?: string;
  type: "WALK_IN";
  status: "COMPLETED";
  priority: "ROUTINE";
  reason?: string;
  source: string;
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
  firebaseLabKey: string;
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

export function buildRemainingSeed(opts: {
  raw: Record<string, unknown>;
  outDir: string;
  idMap: Record<string, string>;
  patients: SeedPatient[];
  encounters: SeedEncounter[];
  consultations: SeedConsultation[];
  labOrders: SeedLabOrder[];
}) {
  const { raw, outDir, idMap, patients, encounters, consultations, labOrders } =
    opts;

  const booking = (raw.booking ?? {}) as Record<
    string,
    Record<string, string | string[] | undefined>
  >;
  const appointments = (raw.appointments ?? {}) as Record<
    string,
    Record<string, string | undefined>
  >;
  const services = (raw.services ?? {}) as Record<
    string,
    {
      date?: string;
      patientId?: string;
      patientName?: string;
      recordedBy?: string;
      serviceType?: string;
      details?: Record<string, unknown>;
      bookingKey?: string;
    }
  >;
  const paymentRequests = (raw.paymentRequests ?? {}) as Record<
    string,
    {
      amount?: string | number;
      createdAt?: string;
      patientId?: string;
      service?: string;
      status?: string;
      fullName?: string;
    }
  >;
  const payments = (raw.payments ?? {}) as Record<
    string,
    {
      PatientId?: string;
      amount?: number | string;
      date?: string;
      method?: string;
      notes?: string;
      status?: string;
      timestamp?: string;
      type?: string;
    }
  >;
  const labResults = (raw.labResults ?? {}) as Record<
    string,
    Record<string, { results?: string; result?: string; date?: string; testTypes?: string[] }>
  >;

  const patientById = new Map(patients.map((p) => [p.id, p]));
  const encsByPatient = new Map<string, SeedEncounter[]>();
  for (const e of encounters) {
    const list = encsByPatient.get(e.patientId) ?? [];
    list.push(e);
    encsByPatient.set(e.patientId, list);
  }
  const consultByEncounter = new Map(
    consultations.map((c) => [c.encounterId, c]),
  );

  function firstEncounter(patientId: string): SeedEncounter | undefined {
    const list = encsByPatient.get(patientId) ?? [];
    return [...list].sort(
      (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
    )[0];
  }

  function sameDayEncounter(
    patientId: string,
    iso: string | undefined,
  ): SeedEncounter | undefined {
    if (!iso) return firstEncounter(patientId);
    const t = Date.parse(iso);
    const list = encsByPatient.get(patientId) ?? [];
    return (
      list.find((e) => Math.abs(Date.parse(e.startedAt) - t) < 36 * 3600 * 1000) ??
      firstEncounter(patientId)
    );
  }

  function ensureBillingEncounter(
    patientId: string,
    key: string,
    at: string,
    reason: string,
    serviceCode?: string,
    /** Invoice.encounterId is unique — billing must always get its own encounter. */
    forceNew = false,
  ): { encounter: SeedEncounter; consultation: SeedConsultation } {
    if (!forceNew) {
      const existing = sameDayEncounter(patientId, at);
      if (existing) {
        const c = consultByEncounter.get(existing.id);
        if (c) return { encounter: existing, consultation: c };
      }
    }
    const encounterId = uuidFromNamespace("phos-encounter", key);
    const consultationId = uuidFromNamespace("phos-consult", key);
    const short = shortHash(key);
    const visitNumber = (encsByPatient.get(patientId)?.length ?? 0) + 1;
    const encounter: SeedEncounter = {
      id: encounterId,
      firebaseVisitKey: key,
      patientId,
      encounterNumber: `ENC-MIG-${short}`,
      visitNumber,
      startedAt: at,
      closedAt: at,
      departmentCode: "OPD",
      serviceCode: serviceCode ?? "OPD",
      type: "WALK_IN",
      status: "COMPLETED",
      priority: "ROUTINE",
      reason,
      source: "billing",
    };
    const consultation: SeedConsultation = {
      id: consultationId,
      encounterId,
      patientId,
      assessment: reason,
      status: "FINALIZED",
      finalizedAt: at,
    };
    encounters.push(encounter);
    consultations.push(consultation);
    const list = encsByPatient.get(patientId) ?? [];
    list.push(encounter);
    encsByPatient.set(patientId, list);
    consultByEncounter.set(encounterId, consultation);
    return { encounter, consultation };
  }

  // --- Triage from booking vitals (attach to first encounter) ---
  const triages: Array<{
    id: string;
    encounterId: string;
    patientId: string;
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
  }> = [];

  for (const patient of patients) {
    const b = booking[patient.firebaseKey];
    if (!b) continue;
    const enc = firstEncounter(patient.id);
    if (!enc) continue;
    const bp = parseBp(String(b.vitalBP ?? ""));
    const temperature = parseNum(String(b.vitalTemp ?? ""));
    const heartRate = parseNum(String(b.vitalHR ?? ""));
    const respiratoryRate = parseNum(String(b.vitalRR ?? ""));
    const spo2 = parseNum(String(b.vitalSpO2 ?? ""));
    const weightKg = parseNum(String(b.vitalWeight ?? ""));
    const heightCm = parseNum(String(b.vitalHeight ?? ""));
    const bloodGlucoseMgDl = parseNum(String(b.vitalGlucose ?? ""));
    const painScore = parseNum(String(b.vitalPain ?? ""));
    const hasAny =
      bp.systolic != null ||
      temperature != null ||
      heartRate != null ||
      respiratoryRate != null ||
      spo2 != null ||
      weightKg != null ||
      heightCm != null ||
      bloodGlucoseMgDl != null ||
      painScore != null;
    if (!hasAny) continue;
    triages.push({
      id: uuidFromNamespace("phos-triage", enc.id),
      encounterId: enc.id,
      patientId: patient.id,
      ...(temperature != null ? { temperature } : {}),
      ...(bp.systolic != null ? { systolic: bp.systolic } : {}),
      ...(bp.diastolic != null ? { diastolic: bp.diastolic } : {}),
      ...(heartRate != null ? { heartRate: Math.round(heartRate) } : {}),
      ...(respiratoryRate != null
        ? { respiratoryRate: Math.round(respiratoryRate) }
        : {}),
      ...(spo2 != null ? { spo2: Math.round(spo2) } : {}),
      ...(weightKg != null ? { weightKg } : {}),
      ...(heightCm != null ? { heightCm } : {}),
      ...(painScore != null ? { painScore: Math.round(painScore) } : {}),
      ...(bloodGlucoseMgDl != null
        ? { bloodGlucoseMgDl: Math.round(bloodGlucoseMgDl) }
        : {}),
      recordedAt: enc.startedAt,
    });
  }

  // --- Appointments ---
  const seedAppointments: Array<{
    id: string;
    patientId: string;
    scheduledAt: string;
    status: string;
    serviceCode?: string;
    notes?: string;
    firebaseKey: string;
  }> = [];

  const patientsByPhone = new Map<string, string>();
  for (const p of patients) {
    // rebuild from id-map reverse isn't enough; use booking phone via firebaseKey
    const b = booking[p.firebaseKey];
    const phone = String(b?.phone ?? "").trim();
    if (phone.length >= 6) patientsByPhone.set(phone, p.id);
  }

  for (const [akey, a] of Object.entries(appointments)) {
    let patientId: string | undefined;
    if (a.patientId && idMap[a.patientId]) patientId = idMap[a.patientId];
    if (!patientId && a.phone) patientId = patientsByPhone.get(a.phone.trim());
    if (!patientId) {
      // create orphan skip — need patient
      continue;
    }
    const date = a.appointmentDate || a.createdAt?.slice(0, 10);
    const slot = a.timeSlot || "09:00";
    const scheduledAt = date
      ? new Date(`${date}T${slot.length === 5 ? slot : "09:00"}:00.000Z`).toISOString()
      : a.createdAt || new Date().toISOString();
    seedAppointments.push({
      id: uuidFromNamespace("phos-appt", akey),
      patientId,
      scheduledAt: Number.isNaN(Date.parse(scheduledAt))
        ? new Date().toISOString()
        : scheduledAt,
      status: mapAppointmentStatus(a.status),
      serviceCode: mapApptServiceCode(a.service),
      notes: [a.notes, a.patientName ? `Name: ${a.patientName}` : ""]
        .filter(Boolean)
        .join(" | ") || undefined,
      firebaseKey: akey,
    });
  }

  // --- FP / service event logs → encounters + consultations ---
  let serviceEventCount = 0;
  for (const [sid, s] of Object.entries(services)) {
    const patientId = s.patientId ? idMap[s.patientId] : undefined;
    if (!patientId) continue;
    const at = s.date || new Date().toISOString();
    const key = `svc:${sid}`;
    const serviceCode =
      s.serviceType === "FP"
        ? "FP"
        : s.serviceType === "US"
          ? "USG"
          : s.serviceType === "LAB"
            ? "CLINIC_LAB"
            : "OPD";
    const detailsText = s.details
      ? Object.entries(s.details)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join("\n")
      : "";
    const { encounter, consultation } = ensureBillingEncounter(
      patientId,
      key,
      at,
      `Service event: ${s.serviceType || "OTHER"}`,
      serviceCode,
    );
    // enrich consultation notes
    consultation.notes = [
      s.recordedBy ? `Recorded by: ${s.recordedBy}` : "",
      detailsText,
    ]
      .filter(Boolean)
      .join("\n");
    consultation.assessment = s.serviceType || consultation.assessment;
    void encounter;
    serviceEventCount += 1;
  }

  // --- Deeper lab parsing: enrich labOrders.items ---
  let labsWithAnalytes = 0;
  for (const lo of labOrders) {
    const [fk, lid] = lo.firebaseLabKey.split(":");
    const node = fk && lid ? labResults[fk]?.[lid] : undefined;
    const text = `${node?.results || ""}\n${node?.result || ""}\n${lo.resultValue || ""}`;
    const analytes = parseLabAnalytes(text);
    if (analytes.length) {
      lo.items = analytes.map((a) => ({
        labTestCode: a.labTestCode,
        value: a.value,
        unit: a.unit,
        label: a.label,
      }));
      labsWithAnalytes += 1;
    } else {
      lo.items = [
        {
          labTestCode: lo.labTestCode || "OTHER",
          value: lo.resultValue,
        },
      ];
    }
  }

  // --- Free-text Rx → medicines + prescriptions ---
  const medicines = new Map<
    string,
    { code: string; name: string; sellingPriceCents: number }
  >();
  const prescriptions: Array<{
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
  }> = [];

  for (const c of consultations) {
    const plan = c.plan || "";
    // strip ultrasound lines for rx parse
    const rxText = plan
      .split("\n")
      .filter((l) => !/^ultrasound:/i.test(l.trim()))
      .join("\n");
    const lines = parsePrescriptionLines(rxText);
    if (!lines.length) continue;
    const enc = encounters.find((e) => e.id === c.encounterId);
    if (!enc) continue;
    for (const line of lines) {
      if (!medicines.has(line.medicineCode)) {
        medicines.set(line.medicineCode, {
          code: line.medicineCode,
          name: line.medicineName,
          sellingPriceCents: 0,
        });
      }
    }
    prescriptions.push({
      id: uuidFromNamespace("phos-rx", c.id),
      prescriptionNumber: `RX-MIG-${shortHash(c.id)}`,
      encounterId: c.encounterId,
      consultationId: c.id,
      patientId: c.patientId,
      notes: "Migrated from free-text plan",
      createdAt: c.finalizedAt,
      items: lines.map((l) => ({
        medicineCode: l.medicineCode,
        dose: l.dose,
        route: l.route,
        frequency: l.frequency,
        duration: l.duration,
        quantity: l.quantity,
        instructions: l.raw,
      })),
    });
  }

  // --- Billing: paymentRequests → invoices; payments → payments ---
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
      type: string;
      description: string;
      quantity: number;
      unitPriceCents: number;
      totalCents: number;
    }>;
    firebasePaymentRequestIds: string[];
  };

  type SeedPayment = {
    id: string;
    paymentNumber: string;
    invoiceId: string;
    patientId: string;
    amountCents: number;
    method: string;
    status: "COMPLETED";
    referenceNumber?: string;
    idempotencyKey: string;
    createdAt: string;
    firebaseKey: string;
  };

  const invoices: SeedInvoice[] = [];
  const seedPayments: SeedPayment[] = [];

  // Index payments by patient firebase key
  const paysByPatient = new Map<string, Array<{ key: string; p: (typeof payments)[string] }>>();
  for (const [pkey, p] of Object.entries(payments)) {
    const fk = p.PatientId;
    if (!fk) continue;
    const list = paysByPatient.get(fk) ?? [];
    list.push({ key: pkey, p });
    paysByPatient.set(fk, list);
  }

  for (const [prId, pr] of Object.entries(paymentRequests)) {
    const patientId = pr.patientId ? idMap[pr.patientId] : undefined;
    if (!patientId || !patientById.has(patientId)) continue;
    const at = pr.createdAt || new Date().toISOString();
    const amountCents = toCents(pr.amount);
    if (amountCents <= 0) continue;

    const key = `bill:${prId}`;
    const { encounter } = ensureBillingEncounter(
      patientId,
      key,
      at,
      `Billing: ${pr.service || "service"}`,
      pr.service?.toLowerCase().includes("lab")
        ? "CLINIC_LAB"
        : pr.service?.toLowerCase().includes("us")
          ? "USG"
          : "OPD",
      true,
    );

    const statusLower = (pr.status || "").toLowerCase();
    const isCompleted = statusLower.includes("complete") || statusLower === "paid";

    // Match a payment from same firebase patient + similar amount
    const fbKey = pr.patientId!;
    const candidates = paysByPatient.get(fbKey) ?? [];
    const matched = candidates.find(({ p }) => {
      const pc = toCents(p.amount);
      return Math.abs(pc - amountCents) < 100; // within 1 ETB
    });

    const paidCents = matched ? toCents(matched.p.amount) : isCompleted ? amountCents : 0;
    const invStatus: SeedInvoice["status"] =
      paidCents >= amountCents ? "PAID" : statusLower.includes("pending") ? "ISSUED" : "ISSUED";

    const invoiceId = uuidFromNamespace("phos-invoice", prId);
    const invoiceNumber = `INV-MIG-${shortHash(prId)}`;
    const itemType = mapInvoiceItemType(pr.service);

    invoices.push({
      id: invoiceId,
      invoiceNumber,
      encounterId: encounter.id,
      patientId,
      status: invStatus,
      subtotalCents: amountCents,
      totalCents: amountCents,
      paidCents: Math.min(paidCents, amountCents),
      issuedAt: at,
      items: [
        {
          type: itemType,
          description: (pr.service || "Clinic service").slice(0, 200),
          quantity: 1,
          unitPriceCents: amountCents,
          totalCents: amountCents,
        },
      ],
      firebasePaymentRequestIds: [prId],
    });

    if (matched) {
      const payAt = matched.p.timestamp || matched.p.date || at;
      seedPayments.push({
        id: uuidFromNamespace("phos-payment", matched.key),
        paymentNumber: `PAY-MIG-${shortHash(matched.key)}`,
        invoiceId,
        patientId,
        amountCents: toCents(matched.p.amount),
        method: mapPaymentMethod(matched.p.method),
        status: "COMPLETED",
        referenceNumber: matched.p.notes?.slice(0, 120),
        idempotencyKey: `mig-pay-${matched.key}`,
        createdAt:
          typeof payAt === "string" && payAt.length === 10
            ? `${payAt}T12:00:00.000Z`
            : String(payAt),
        firebaseKey: matched.key,
      });
      // remove matched so leftover payments can create invoices too
      paysByPatient.set(
        fbKey,
        candidates.filter((c) => c.key !== matched.key),
      );
    } else if (paidCents > 0 && isCompleted) {
      // synthetic payment when request completed but no payment row matched
      seedPayments.push({
        id: uuidFromNamespace("phos-payment", `syn:${prId}`),
        paymentNumber: `PAY-MIG-${shortHash(`syn:${prId}`)}`,
        invoiceId,
        patientId,
        amountCents,
        method: "CASH",
        status: "COMPLETED",
        idempotencyKey: `mig-pay-syn-${prId}`,
        createdAt: at,
        firebaseKey: `syn:${prId}`,
      });
    }
  }

  // Leftover payments without paymentRequest → invoice + payment
  for (const [fbKey, list] of paysByPatient) {
    const patientId = idMap[fbKey];
    if (!patientId) continue;
    for (const { key, p } of list) {
      const amountCents = toCents(p.amount);
      if (amountCents <= 0) continue;
      const at = p.timestamp || (p.date ? `${p.date}T12:00:00.000Z` : new Date().toISOString());
      const billKey = `bill-pay:${key}`;
      const { encounter } = ensureBillingEncounter(
        patientId,
        billKey,
        at,
        p.notes || "Payment (migrated)",
        "OPD",
        true,
      );
      const invoiceId = uuidFromNamespace("phos-invoice", `pay:${key}`);
      invoices.push({
        id: invoiceId,
        invoiceNumber: `INV-MIG-${shortHash(`pay:${key}`)}`,
        encounterId: encounter.id,
        patientId,
        status: "PAID",
        subtotalCents: amountCents,
        totalCents: amountCents,
        paidCents: amountCents,
        issuedAt: at,
        items: [
          {
            type: mapInvoiceItemType(p.notes),
            description: (p.notes || p.type || "Payment").slice(0, 200),
            quantity: 1,
            unitPriceCents: amountCents,
            totalCents: amountCents,
          },
        ],
        firebasePaymentRequestIds: [],
      });
      seedPayments.push({
        id: uuidFromNamespace("phos-payment", key),
        paymentNumber: `PAY-MIG-${shortHash(key)}`,
        invoiceId,
        patientId,
        amountCents,
        method: mapPaymentMethod(p.method),
        status: "COMPLETED",
        referenceNumber: p.notes?.slice(0, 120),
        idempotencyKey: `mig-pay-${key}`,
        createdAt: at,
        firebaseKey: key,
      });
    }
  }

  // Rewrite encounters/consultations/lab-orders with additions
  fs.writeFileSync(
    path.join(outDir, "encounters.json"),
    JSON.stringify(encounters, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "consultations.json"),
    JSON.stringify(consultations, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "lab-orders.json"),
    JSON.stringify(labOrders, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "triages.json"),
    JSON.stringify(triages, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "appointments.json"),
    JSON.stringify(seedAppointments, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "medicines.json"),
    JSON.stringify([...medicines.values()], null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "prescriptions.json"),
    JSON.stringify(prescriptions, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "invoices.json"),
    JSON.stringify(invoices, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "payments.json"),
    JSON.stringify(seedPayments, null, 2),
  );

  return {
    triageCount: triages.length,
    appointmentCount: seedAppointments.length,
    serviceEventCount,
    labsWithAnalytes,
    medicineCount: medicines.size,
    prescriptionCount: prescriptions.length,
    invoiceCount: invoices.length,
    paymentCount: seedPayments.length,
    encounterCount: encounters.length,
    consultationCount: consultations.length,
  };
}
