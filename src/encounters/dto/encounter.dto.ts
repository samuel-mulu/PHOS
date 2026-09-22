import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import {
  EncounterPriority,
  EncounterStatus,
  EncounterType,
} from "../../generated/prisma/client";
export class CreateEncounterDto {
  @IsUUID() patientId!: string;
  @IsUUID() facilityId!: string;
  @IsUUID() departmentId!: string;
  @IsUUID() serviceId!: string;
  @IsOptional() @IsEnum(EncounterType) type?: EncounterType;
  @IsOptional() @IsEnum(EncounterPriority) priority?: EncounterPriority;
  @IsOptional() @IsString() reason?: string;
}
export class TransitionEncounterDto {
  @IsEnum(EncounterStatus) status!: EncounterStatus;
}
