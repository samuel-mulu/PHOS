/** Clinic card patient numbers: HC + digits (matches paper + Firebase). */

export const PATIENT_NUMBER_PREFIX = "HC";
export const PATIENT_NUMBER_PAD = 6;
/** Clinic paper cards are typically ≤5 digits; larger values are outliers for sequence sync. */
export const PATIENT_NUMBER_SANE_MAX = 99_999;

/**
 * Normalize a clinic / paper / Firebase idNumber into canonical HC#####.
 * Returns null when the value cannot be used as a patient number.
 */
export function normalizePatientNumber(
  raw: string | undefined | null,
): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim().toUpperCase().replace(/\s+/g, "");
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const digits = trimmed.replace(/^0+/, "") || "0";
    return `${PATIENT_NUMBER_PREFIX}${digits}`;
  }

  const m = trimmed.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  const [, prefix, digitPart] = m;
  const digits = digitPart.replace(/^0+/, "") || "0";

  // Collapse clinic variants (Hc, Hcm, HV, HH, HCC, HVC, …) onto HC.
  if (
    prefix === "HC" ||
    prefix === "HCM" ||
    prefix.startsWith("HC") ||
    prefix === "HV" ||
    prefix === "HH" ||
    prefix === "HVC"
  ) {
    return `${PATIENT_NUMBER_PREFIX}${digits}`;
  }

  return null;
}

export function formatAutoPatientNumber(seq: bigint | number): string {
  return `${PATIENT_NUMBER_PREFIX}${seq
    .toString()
    .padStart(PATIENT_NUMBER_PAD, "0")}`;
}

/** Numeric part of an HC######## number, or null if not HC+digits. */
export function parsePatientNumberNumeric(
  patientNumber: string,
): number | null {
  const m = patientNumber.trim().toUpperCase().match(/^HC(\d+)$/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

export function isSanePatientNumberNumeric(n: number): boolean {
  return Number.isFinite(n) && n >= 1 && n <= PATIENT_NUMBER_SANE_MAX;
}
