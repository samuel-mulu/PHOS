import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from "class-validator";
import {
  EncounterPriority,
  EncounterStatus,
  EncounterType,
  QueueStation,
} from "../../generated/prisma/client";

/** Where the patient goes after registration (not always triage). */
export class CreateEncounterDto {
  @IsUUID() patientId!: string;
  @IsUUID() facilityId!: string;
  @IsUUID() departmentId!: string;
  /** Optional clinic service / fee — not required for every visit. */
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsEnum(EncounterType) type?: EncounterType;
  @IsOptional() @IsEnum(EncounterPriority) priority?: EncounterPriority;
  @IsOptional() @IsString() reason?: string;
  /** TRIAGE or DOCTOR — defaults to DOCTOR. */
  @IsOptional()
  @IsIn(["TRIAGE", "DOCTOR"])
  initialStation?: "TRIAGE" | "DOCTOR";
  /** Optional doctor assignment (front desk / admin). */
  @IsOptional()
  @IsUUID()
  assignedDoctorId?: string;
}
export class TransitionEncounterDto {
  @IsEnum(EncounterStatus) status!: EncounterStatus;
}
export class RouteEncounterDto {
  @IsEnum(QueueStation) station!: QueueStation;
  @IsOptional()
  @IsUUID()
  assignedDoctorId?: string;
}
export class AssignDoctorDto {
  @IsUUID()
  assignedDoctorId!: string;
}

/** Clinical mid-visit charge → cashier, then auto-return to origin station. */
export class PaymentRequestDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsIn(["DOCTOR", "LAB", "PHARMACY", "TRIAGE"])
  returnStation!: "DOCTOR" | "LAB" | "PHARMACY" | "TRIAGE";
}
