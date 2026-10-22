/**
 * Transform Firebase RTDB export → clean PHOS seed JSON.
 * Phase 1: patients (+ age→DOB). Phase 2: visits, consultations, labs.
 *
 * Usage:
 *   npx tsx scripts/firebase-to-seed-data.ts [path-to-export.json]
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { normalizePatientNumber } from "../src/patients/patient-number.util";
import { buildRemainingSeed } from "./build-remaining-seed";

type Sex = "MALE" | "FEMALE" | "OTHER" | "UNKNOWN";

type FirebaseBooking = {
  fullName?: string;
  gender?: string;
  idNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  dob?: string;
  age?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  timestamp?: string;
  Services?: string[];
  vitalBP?: string;
  vitalTemp?: string;
  vitalHR?: string;
  vitalRR?: string;
  vitalSpO2?: string;
  vitalWeight?: string;
  vitalHeight?: string;
  vitalGlucose?: string;
  vitalPain?: string;
};

type VisitRec = {
  diagnosis?: string;
  notes?: string;
  prescriptions?: string;
  ultrasound?: string;
  vitals?: string;
  timestamp?: string;
  updatedAt?: string;
  doctor?: string;
};

type LabRec = {
  date?: string;
  doctor?: string;
  results?: string;
  result?: string;
  testTypes?: string[];
  type?: string;
  labs?: unknown;
  addedBy?: string;
};

export type SeedPatient = {
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
  ageAtRegistration?: string;
  serviceLabels?: string[];
};

export type SeedEncounter = {
  id: string;
  firebaseVisitKey: string;
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
  source: "visitHistory" | "medicalRecords" | "labOnly";
};

export type SeedConsultation = {
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

export type SeedLabOrder = {
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
};

type RejectRow = {
  firebaseKey: string;
  reason: string;
  idNumber?: string;
  fullName?: string;
  phone?: string;
};

function uuidFromNamespace(ns: string, key: string): string {
  const hash = createHash("sha256").update(`${ns}:${key}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function mapSex(gender: string | undefined): Sex {
  const g = (gender ?? "").trim().toLowerCase();
  if (g === "male" || g === "m") return "MALE";
  if (g === "female" || g === "f") return "FEMALE";
  if (g === "other") return "OTHER";
  return "UNKNOWN";
}

function splitName(fullName: string): {
  firstName: string;
  middleName?: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Unknown", lastName: "Patient" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "Unknown" };
  if (parts.length === 2)
    return { firstName: parts[0]!, lastName: parts[1]! };
  return {
    firstName: parts[0]!,
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1]!,
  };
}

function cleanPhone(phone: string | undefined): string | undefined {
  if (phone == null) return undefined;
  const trimmed = phone.trim();
  if (!trimmed) return undefined;
  if (trimmed === "09" || trimmed === "0" || trimmed.length < 6) return undefined;
  return trimmed;
}

function cleanEmail(email: string | undefined): string | undefined {
  if (email == null) return undefined;
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes("@")) return undefined;
  return trimmed;
}

/** Approximate DOB = referenceDate − age years (clinic cards store age, not DOB). */
function dobFromAge(ageRaw: string | undefined, referenceIso?: string): string | null {
  if (ageRaw == null) return null;
  const age = Number.parseInt(String(ageRaw).trim(), 10);
  if (!Number.isInteger(age) || age < 0 || age > 120) return null;
  const ref = referenceIso ? new Date(referenceIso) : new Date();
  if (Number.isNaN(ref.getTime())) return null;
  const d = new Date(ref);
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

/**
 * Prefer age→DOB. Only trust Firebase dob if it looks like a real birth date
 * (at least ~1 year before registration, not near registration day).
 */
function resolveDateOfBirth(
  age: string | undefined,
  dob: string | undefined,
  registeredAt?: string,
): string | null {
  const fromAge = dobFromAge(age, registeredAt);
  if (fromAge) return fromAge;

  if (!dob?.trim()) return null;
  const parsed = new Date(dob.trim());
  if (Number.isNaN(parsed.getTime())) return null;
  const reg = registeredAt ? new Date(registeredAt) : new Date();
  const yearsBeforeReg =
    (reg.getTime() - parsed.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (yearsBeforeReg < 1 || yearsBeforeReg > 120) return null;
  return parsed.toISOString().slice(0, 10);
}

function mapServiceCode(labels: string[] | undefined): string | undefined {
  if (!labels?.length) return undefined;
  const joined = labels.join(" ").toLowerCase();
  if (joined.includes("emergency")) return "EMERG";
  if (joined.includes("maternal") || joined.includes("mch")) return "MCH";
  if (joined.includes("ultrasound")) return "USG";
  if (joined.includes("laboratory") || joined.includes("lab")) return "CLINIC_LAB";
  if (joined.includes("wound")) return "WOUND";
  if (joined.includes("delivery") || joined.includes("postnatal") || joined.includes("pnc"))
    return "PNC";
  if (joined.includes("family planning") || joined.includes("reproductive")) return "FP";
  if (joined.includes("outpatient") || joined.includes("general")) return "OPD";
  return "OPD";
}

function visitFingerprint(v: VisitRec): string {
  return [
    (v.diagnosis ?? "").trim(),
    (v.notes ?? "").trim(),
    (v.prescriptions ?? "").trim(),
    (v.ultrasound ?? "").trim(),
  ].join("|");
}

function dedupeVisits(
  entries: Array<{ key: string; visit: VisitRec }>,
): Array<{ key: string; visit: VisitRec }> {
  const sorted = [...entries].sort((a, b) => {
    const ta = Date.parse(a.visit.timestamp || a.visit.updatedAt || "") || 0;
    const tb = Date.parse(b.visit.timestamp || b.visit.updatedAt || "") || 0;
    return ta - tb;
  });
  const kept: Array<{ key: string; visit: VisitRec }> = [];
  for (const cur of sorted) {
    const t = Date.parse(cur.visit.timestamp || cur.visit.updatedAt || "") || 0;
    const fp = visitFingerprint(cur.visit);
    const prev = kept[kept.length - 1];
    if (prev) {
      const pt = Date.parse(prev.visit.timestamp || prev.visit.updatedAt || "") || 0;
      if (fp === visitFingerprint(prev.visit) && Math.abs(t - pt) < 3 * 60 * 1000) {
        // Same chart saved twice within 3 minutes → keep newer
        kept[kept.length - 1] = cur;
        continue;
      }
    }
    kept.push(cur);
  }
  return kept;
}

function pickLabTestCode(lab: LabRec): string {
  const types = (lab.testTypes || []).map((t) => t.toLowerCase());
  const text = `${lab.results || ""} ${lab.result || ""}`.toLowerCase();
  if (types.some((t) => t.includes("blood group")) || /\bbg\s*=/.test(text))
    return "BG";
  if (types.some((t) => t.includes("urin"))) return "UA";
  if (types.some((t) => t.includes("hepatitis b") || t.includes("hbsag")))
    return "HBsAg";
  if (types.some((t) => t.includes("hepatitis c"))) return "HCV";
  if (types.some((t) => t.includes("rpr") || t.includes("vdrl"))) return "VDRL";
  if (types.some((t) => t.includes("hiv"))) return "HIV";
  if (types.some((t) => t.includes("cbc") || t.includes("hemoglobin"))) return "HGB";
  if (types.some((t) => t.includes("malaria") || t.includes("blood film")))
    return "MAL";
  if (types.some((t) => t.includes("stool"))) return "STOOL";
  if (types.some((t) => t.includes("hcg") || t.includes("pregnancy"))) return "BHCG";
  return "OTHER";
}

function labResultText(lab: LabRec): string {
  const parts = [lab.results, lab.result].filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  return parts.join("\n\n").trim() || "(empty lab sheet)";
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const inputPath =
    process.argv[2] ||
    process.env.FIREBASE_EXPORT_PATH ||
    path.join(repoRoot, "hiwetclinicshire-bde73-default-rtdb-export.json");
  const outDir =
    process.env.SEED_DATA_DIR || path.join(repoRoot, "prisma", "seed-data");

  if (!fs.existsSync(inputPath)) {
    console.error(`Firebase export not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Reading ${inputPath}…`);
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8")) as {
    booking?: Record<string, FirebaseBooking>;
    visitHistory?: Record<string, Record<string, VisitRec>>;
    medicalRecords?: Record<string, VisitRec>;
    labResults?: Record<string, Record<string, LabRec>>;
    [key: string]: unknown;
  };
  const booking = raw.booking ?? {};
  const visitHistory = raw.visitHistory ?? {};
  const medicalRecords = raw.medicalRecords ?? {};
  const labResults = raw.labResults ?? {};
  const entries = Object.entries(booking);
  console.log(`Bookings: ${entries.length}`);

  type Candidate = {
    firebaseKey: string;
    booking: FirebaseBooking;
    patientNumber: string;
    ts: number;
  };

  const rejects: RejectRow[] = [];
  const byNumber = new Map<string, Candidate[]>();

  for (const [firebaseKey, b] of entries) {
    const patientNumber = normalizePatientNumber(b.idNumber);
    if (!patientNumber) {
      rejects.push({
        firebaseKey,
        reason: "unparseable_idNumber",
        idNumber: b.idNumber,
        fullName: b.fullName,
        phone: b.phone,
      });
      continue;
    }
    const ts = b.timestamp ? Date.parse(b.timestamp) : 0;
    const list = byNumber.get(patientNumber) ?? [];
    list.push({
      firebaseKey,
      booking: b,
      patientNumber,
      ts: Number.isFinite(ts) ? ts : 0,
    });
    byNumber.set(patientNumber, list);
  }

  const patients: SeedPatient[] = [];
  /** firebase booking key → patient uuid (aliases included) */
  const idMap: Record<string, string> = {};
  /** patient uuid → primary firebase booking key */
  const patientPrimaryKey = new Map<string, string>();
  /** patient uuid → service labels from booking */
  const patientServices = new Map<string, string[] | undefined>();

  let duplicateGroups = 0;
  let aliasedKeys = 0;
  let badPhonesCleared = 0;
  let maxHc = 0;
  const SANE_HC_MAX = 99_999;
  let maxHcSane = 0;
  let outlierHcCount = 0;
  let dobFromAgeCount = 0;

  for (const [patientNumber, group] of byNumber) {
    group.sort((a, b) => b.ts - a.ts);
    const winner = group[0]!;
    if (group.length > 1) {
      duplicateGroups += 1;
      for (const loser of group.slice(1)) {
        aliasedKeys += 1;
        rejects.push({
          firebaseKey: loser.firebaseKey,
          reason: "duplicate_idNumber_aliased",
          idNumber: loser.booking.idNumber,
          fullName: loser.booking.fullName,
          phone: loser.booking.phone,
        });
      }
    }

    const id = uuidFromNamespace("phos-patient", winner.firebaseKey);
    idMap[winner.firebaseKey] = id;
    patientPrimaryKey.set(id, winner.firebaseKey);
    for (const alias of group.slice(1)) {
      idMap[alias.firebaseKey] = id;
    }

    const b = winner.booking;
    const name = splitName(b.fullName ?? "Unknown Patient");
    const phoneRaw = b.phone?.trim();
    const phone = cleanPhone(b.phone);
    if (phoneRaw && !phone) badPhonesCleared += 1;

    const numeric = Number.parseInt(patientNumber.replace(/^HC/i, ""), 10);
    if (Number.isFinite(numeric) && numeric > maxHc) maxHc = numeric;
    if (Number.isFinite(numeric) && numeric <= SANE_HC_MAX) {
      if (numeric > maxHcSane) maxHcSane = numeric;
    } else if (Number.isFinite(numeric)) {
      outlierHcCount += 1;
    }

    const dateOfBirth = resolveDateOfBirth(b.age, b.dob, b.timestamp);
    if (b.age?.trim() && dateOfBirth) dobFromAgeCount += 1;

    patientServices.set(id, b.Services);

    const patient: SeedPatient = {
      id,
      firebaseKey: winner.firebaseKey,
      patientNumber,
      firstName: name.firstName.slice(0, 120),
      ...(name.middleName ? { middleName: name.middleName.slice(0, 120) } : {}),
      lastName: name.lastName.slice(0, 120),
      sex: mapSex(b.gender),
      dateOfBirth,
      ...(phone ? { phone } : {}),
      ...(cleanEmail(b.email) ? { email: cleanEmail(b.email) } : {}),
      ...(b.address?.trim() ? { address: b.address.trim() } : {}),
      ...(b.emergencyName?.trim()
        ? { emergencyContactName: b.emergencyName.trim() }
        : {}),
      ...(cleanPhone(b.emergencyPhone)
        ? { emergencyContactPhone: cleanPhone(b.emergencyPhone) }
        : {}),
      ...(b.timestamp ? { createdAt: b.timestamp } : {}),
      ...(b.age?.trim() ? { ageAtRegistration: b.age.trim() } : {}),
      ...(b.Services?.length ? { serviceLabels: b.Services } : {}),
    };
    patients.push(patient);
  }

  patients.sort((a, b) => a.patientNumber.localeCompare(b.patientNumber));

  // --- Visits / consultations ---
  const encounters: SeedEncounter[] = [];
  const consultations: SeedConsultation[] = [];
  /** patientId → list of { encounterId, startedAt } for lab attachment */
  const patientEncounters = new Map<
    string,
    Array<{ encounterId: string; consultationId: string; startedAt: number }>
  >();

  let visitDedupedAway = 0;

  for (const patient of patients) {
    const keysForPatient = Object.entries(idMap)
      .filter(([, pid]) => pid === patient.id)
      .map(([k]) => k);

    const rawVisits: Array<{ key: string; visit: VisitRec }> = [];
    for (const fk of keysForPatient) {
      const node = visitHistory[fk];
      if (!node) continue;
      for (const [vk, visit] of Object.entries(node)) {
        if (!visit || typeof visit !== "object") continue;
        if (!visit.timestamp && !visit.diagnosis && !visit.notes) continue;
        rawVisits.push({ key: `${fk}:${vk}`, visit });
      }
    }

    let visits = dedupeVisits(rawVisits);
    visitDedupedAway += rawVisits.length - visits.length;

    // Fallback: medicalRecords latest chart if no visitHistory
    if (visits.length === 0) {
      for (const fk of keysForPatient) {
        const mr = medicalRecords[fk];
        if (!mr || typeof mr !== "object") continue;
        if (!mr.diagnosis && !mr.notes && !mr.prescriptions) continue;
        visits = [
          {
            key: `mr:${fk}`,
            visit: {
              ...mr,
              timestamp:
                mr.timestamp ||
                mr.updatedAt ||
                patient.createdAt ||
                new Date().toISOString(),
            },
          },
        ];
        break;
      }
    }

    const serviceCode = mapServiceCode(patientServices.get(patient.id));
    let visitNumber = 0;
    const encList: Array<{
      encounterId: string;
      consultationId: string;
      startedAt: number;
    }> = [];

    for (const { key: visitKey, visit } of visits) {
      visitNumber += 1;
      const startedAt =
        visit.timestamp ||
        visit.updatedAt ||
        patient.createdAt ||
        new Date().toISOString();
      const encounterId = uuidFromNamespace("phos-encounter", visitKey);
      const consultationId = uuidFromNamespace("phos-consult", visitKey);
      const short = createHash("sha1")
        .update(visitKey)
        .digest("hex")
        .slice(0, 10)
        .toUpperCase();

      const planParts = [
        visit.prescriptions?.trim(),
        visit.ultrasound?.trim()
          ? `Ultrasound: ${visit.ultrasound.trim()}`
          : "",
      ].filter(Boolean);

      const notesParts = [
        visit.vitals?.trim() ? `Vitals: ${visit.vitals.trim()}` : "",
      ].filter(Boolean);

      encounters.push({
        id: encounterId,
        firebaseVisitKey: visitKey,
        patientId: patient.id,
        encounterNumber: `ENC-MIG-${short}`,
        visitNumber,
        type: "WALK_IN",
        status: "COMPLETED",
        priority: "ROUTINE",
        reason: visit.diagnosis?.trim() || undefined,
        startedAt,
        closedAt: startedAt,
        departmentCode: "OPD",
        serviceCode,
        source: visitKey.startsWith("mr:") ? "medicalRecords" : "visitHistory",
      });

      consultations.push({
        id: consultationId,
        encounterId,
        patientId: patient.id,
        chiefComplaint: visit.notes?.trim() || undefined,
        assessment: visit.diagnosis?.trim() || undefined,
        plan: planParts.join("\n") || undefined,
        notes: notesParts.join("\n") || undefined,
        status: "FINALIZED",
        finalizedAt: startedAt,
        diagnosisLabel: visit.diagnosis?.trim() || undefined,
      });

      encList.push({
        encounterId,
        consultationId,
        startedAt: Date.parse(startedAt) || 0,
      });
    }
    patientEncounters.set(patient.id, encList);
  }

  // --- Labs ---
  const labOrders: SeedLabOrder[] = [];
  let labsAttached = 0;
  let labsNewEncounter = 0;

  for (const patient of patients) {
    const keysForPatient = Object.entries(idMap)
      .filter(([, pid]) => pid === patient.id)
      .map(([k]) => k);

    const labs: Array<{ key: string; lab: LabRec }> = [];
    for (const fk of keysForPatient) {
      const node = labResults[fk];
      if (!node) continue;
      for (const [lk, lab] of Object.entries(node)) {
        if (!lab || typeof lab !== "object") continue;
        labs.push({ key: `${fk}:${lk}`, lab });
      }
    }
    if (!labs.length) continue;

    labs.sort(
      (a, b) =>
        (Date.parse(a.lab.date || "") || 0) - (Date.parse(b.lab.date || "") || 0),
    );

    let encList = patientEncounters.get(patient.id) ?? [];
    let labVisitOffset = 0;

    for (const { key: labKey, lab } of labs) {
      const labAt = Date.parse(lab.date || "") || 0;
      const dayMs = 24 * 3600 * 1000;
      let match = encList.find((e) => Math.abs(e.startedAt - labAt) < dayMs);
      if (!match && encList.length === 1) match = encList[0];

      let encounterId: string;
      let consultationId: string;
      const createdAt = lab.date || patient.createdAt || new Date().toISOString();

      if (match) {
        encounterId = match.encounterId;
        consultationId = match.consultationId;
        labsAttached += 1;
      } else {
        labVisitOffset += 1;
        const syntheticKey = `lab:${labKey}`;
        encounterId = uuidFromNamespace("phos-encounter", syntheticKey);
        consultationId = uuidFromNamespace("phos-consult", syntheticKey);
        const short = createHash("sha1")
          .update(syntheticKey)
          .digest("hex")
          .slice(0, 10)
          .toUpperCase();
        const visitNumber =
          (patientEncounters.get(patient.id)?.length ?? 0) + labVisitOffset;
        encounters.push({
          id: encounterId,
          firebaseVisitKey: syntheticKey,
          patientId: patient.id,
          encounterNumber: `ENC-MIG-${short}`,
          visitNumber,
          type: "WALK_IN",
          status: "COMPLETED",
          priority: "ROUTINE",
          reason: "Lab (migrated)",
          startedAt: createdAt,
          closedAt: createdAt,
          departmentCode: "OPD",
          serviceCode: "CLINIC_LAB",
          source: "labOnly",
        });
        consultations.push({
          id: consultationId,
          encounterId,
          patientId: patient.id,
          assessment: "Lab result (migrated)",
          notes: lab.doctor ? `Recorded by: ${lab.doctor}` : undefined,
          status: "FINALIZED",
          finalizedAt: createdAt,
        });
        encList = [
          ...encList,
          {
            encounterId,
            consultationId,
            startedAt: labAt || Date.parse(createdAt) || 0,
          },
        ];
        patientEncounters.set(patient.id, encList);
        labsNewEncounter += 1;
      }

      const orderId = uuidFromNamespace("phos-lab-order", labKey);
      const shortOrd = createHash("sha1")
        .update(labKey)
        .digest("hex")
        .slice(0, 10)
        .toUpperCase();
      const resultValue = labResultText(lab);
      labOrders.push({
        id: orderId,
        orderNumber: `LAB-MIG-${shortOrd}`,
        encounterId,
        consultationId,
        patientId: patient.id,
        firebaseLabKey: labKey,
        clinicalNotes: lab.testTypes?.length
          ? `Tests: ${lab.testTypes.join(", ")}`
          : undefined,
        createdAt,
        labTestCode: pickLabTestCode(lab),
        resultValue,
        resultNotes: lab.addedBy ? `Added by: ${lab.addedBy}` : undefined,
      });
    }
  }

  fs.mkdirSync(outDir, { recursive: true });

  const seqBase = maxHcSane > 0 ? maxHcSane : maxHc;
  const meta = {
    generatedAt: new Date().toISOString(),
    source: path.basename(inputPath),
    bookingCount: entries.length,
    patientCount: patients.length,
    encounterCount: encounters.length,
    consultationCount: consultations.length,
    labOrderCount: labOrders.length,
    rejectCount: rejects.length,
    duplicateGroups,
    aliasedKeys,
    badPhonesCleared,
    outlierHcCount,
    dobFromAgeCount,
    visitDedupedAway,
    labsAttached,
    labsNewEncounter,
    maxHcNumeric: maxHc,
    maxHcSane,
    sequenceMax: seqBase,
    nextAutoPatientNumber: `HC${(seqBase + 1).toString().padStart(6, "0")}`,
  };

  fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(outDir, "id-map.json"), JSON.stringify(idMap, null, 2));
  fs.writeFileSync(
    path.join(outDir, "patients.json"),
    JSON.stringify(patients, null, 2),
  );
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
    path.join(outDir, "rejects.json"),
    JSON.stringify(rejects, null, 2),
  );

  console.log("Building remaining seed (triage, billing, Rx, appointments)…");
  const remaining = buildRemainingSeed({
    raw: raw as Record<string, unknown>,
    outDir,
    idMap,
    patients,
    encounters,
    consultations,
    labOrders,
  });

  const metaFull = {
    ...meta,
    encounterCount: remaining.encounterCount,
    consultationCount: remaining.consultationCount,
    ...remaining,
  };
  fs.writeFileSync(
    path.join(outDir, "meta.json"),
    JSON.stringify(metaFull, null, 2),
  );

  console.log(`Wrote ${outDir}`);
  console.log(JSON.stringify(metaFull, null, 2));
}

main();
