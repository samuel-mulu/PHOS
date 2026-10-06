import { IsEnum, IsIn, IsOptional, IsString, IsUUID } from "class-validator";
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
  @IsUUID() serviceId!: string;
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
