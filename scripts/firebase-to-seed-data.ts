/**
 * Transform Firebase RTDB export → clean PHOS seed JSON (patients first).
 *
 * Usage:
 *   npx tsx scripts/firebase-to-seed-data.ts [path-to-export.json]
 *
 * Env:
 *   FIREBASE_EXPORT_PATH — override input path
 *   SEED_DATA_DIR — override output dir (default prisma/seed-data)
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { normalizePatientNumber } from "../src/patients/patient-number.util";

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

type RejectRow = {
  firebaseKey: string;
  reason: string;
  idNumber?: string;
  fullName?: string;
  phone?: string;
};

function uuidFromKey(key: string): string {
  const hash = createHash("sha256").update(`phos-patient:${key}`).digest();
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
  // Placeholder / junk from production
  if (trimmed === "09" || trimmed === "0" || trimmed.length < 6) return undefined;
  return trimmed;
}

function cleanEmail(email: string | undefined): string | undefined {
  if (email == null) return undefined;
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes("@")) return undefined;
  return trimmed;
}

function parseDob(dob: string | undefined): string | null {
  if (dob == null) return null;
  const trimmed = dob.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
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
  };
  const booking = raw.booking ?? {};
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
  const idMap: Record<string, string> = {};
  let duplicateGroups = 0;
  let aliasedKeys = 0;
  let badPhonesCleared = 0;
  let maxHc = 0;
  /** Clinic cards are typically ≤5 digits; 6-digit values are treated as typos for sequence. */
  const SANE_HC_MAX = 99_999;
  let maxHcSane = 0;
  let outlierHcCount = 0;

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

    const id = uuidFromKey(winner.firebaseKey);
    idMap[winner.firebaseKey] = id;
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

    const patient: SeedPatient = {
      id,
      firebaseKey: winner.firebaseKey,
      patientNumber,
      firstName: name.firstName.slice(0, 120),
      ...(name.middleName ? { middleName: name.middleName.slice(0, 120) } : {}),
      lastName: name.lastName.slice(0, 120),
      sex: mapSex(b.gender),
      dateOfBirth: parseDob(b.dob),
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

  fs.mkdirSync(outDir, { recursive: true });

  const seqBase = maxHcSane > 0 ? maxHcSane : maxHc;
  const meta = {
    generatedAt: new Date().toISOString(),
    source: path.basename(inputPath),
    bookingCount: entries.length,
    patientCount: patients.length,
    rejectCount: rejects.length,
    duplicateGroups,
    aliasedKeys,
    badPhonesCleared,
    outlierHcCount,
    maxHcNumeric: maxHc,
    maxHcSane,
    /** Sequence / blank-create continues from sane clinic cards (≤5 digits). */
    sequenceMax: seqBase,
    nextAutoPatientNumber: `HC${(seqBase + 1).toString().padStart(6, "0")}`,
  };

  fs.writeFileSync(
    path.join(outDir, "meta.json"),
    JSON.stringify(meta, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "id-map.json"),
    JSON.stringify(idMap, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "patients.json"),
    JSON.stringify(patients, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, "rejects.json"),
    JSON.stringify(rejects, null, 2),
  );

  console.log(`Wrote ${outDir}`);
  console.log(JSON.stringify(meta, null, 2));
}

main();
