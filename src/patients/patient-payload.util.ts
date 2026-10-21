import { CreatePatientDto, UpdatePatientDto } from "./dto/patient.dto";

function optionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

const CREATE_OPTIONAL_STRING_KEYS = [
  "patientNumber",
  "middleName",
  "phone",
  "email",
  "address",
  "governmentId",
  "emergencyContactName",
  "emergencyContactPhone",
  "allergies",
] as const;

/** Update DTO omits patientNumber (clinic ID is immutable after create). */
const UPDATE_OPTIONAL_STRING_KEYS = [
  "middleName",
  "phone",
  "email",
  "address",
  "governmentId",
  "emergencyContactName",
  "emergencyContactPhone",
  "allergies",
] as const;

export function sanitizeCreatePatientDto(dto: CreatePatientDto): CreatePatientDto {
  const out = { ...dto };
  for (const key of CREATE_OPTIONAL_STRING_KEYS) {
    const value = optionalString(out[key]);
    if (value === undefined) {
      delete out[key];
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function sanitizeUpdatePatientDto(dto: UpdatePatientDto): UpdatePatientDto {
  const out = { ...dto };
  for (const key of UPDATE_OPTIONAL_STRING_KEYS) {
    if (!(key in out)) continue;
    const value = optionalString(out[key]);
    if (value === undefined) {
      delete out[key];
    } else {
      out[key] = value;
    }
  }
  return out;
}
