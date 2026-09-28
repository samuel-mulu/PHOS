import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { AppointmentStatus } from "../../generated/prisma/client";

export class CreateAppointmentDto {
  @IsUUID() patientId!: string;
  @IsDateString() scheduledAt!: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() serviceId?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAppointmentStatusDto {
  @IsEnum(AppointmentStatus) status!: AppointmentStatus;
}

export class LinkAppointmentEncounterDto {
  @IsUUID() encounterId!: string;
}
