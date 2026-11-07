import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { PartialType } from "@nestjs/swagger";
import {
  ContraceptiveMethod,
  FpOutcome,
  FpVisitType,
} from "../../generated/prisma/client";

export class CreateFamilyPlanningDto {
  @IsOptional() @IsUUID() encounterId?: string;
  @IsOptional() @IsEnum(FpVisitType) visitType?: FpVisitType;
  @IsOptional() @IsInt() @Min(0) gravidity?: number;
  @IsOptional() @IsInt() @Min(0) parity?: number;
  @IsOptional() @IsInt() @Min(0) livingChildren?: number;
  @IsOptional() @IsEnum(ContraceptiveMethod) previousMethod?: ContraceptiveMethod;
  @IsOptional() @IsEnum(ContraceptiveMethod) currentMethod?: ContraceptiveMethod;
  @IsOptional() @IsString() pregnancyStatus?: string;
  @IsOptional() @IsInt() @Min(40) @Max(300) systolic?: number;
  @IsOptional() @IsInt() @Min(20) @Max(200) diastolic?: number;
  @IsOptional() @IsString() contraindications?: string;
  @IsOptional() @IsBoolean() counselingDone?: boolean;
  @IsOptional() @IsString() counselingNotes?: string;
  @IsOptional() @IsDateString() procedureDate?: string;
  @IsOptional() @IsString() sideEffects?: string;
  @IsOptional() @IsDateString() nextAppointment?: string;
  @IsOptional() @IsEnum(FpOutcome) outcome?: FpOutcome;
}

export class UpdateFamilyPlanningDto extends PartialType(
  CreateFamilyPlanningDto,
) {}
