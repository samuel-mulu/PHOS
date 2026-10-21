import { Type } from "class-transformer";
import {
  IsDate,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { Sex } from "../../generated/prisma/client";
import { OmitType, PartialType } from "@nestjs/swagger";
export class CreatePatientDto {
  /** Clinic card ID (e.g. HC15274). Blank → auto HC next after latest. */
  @IsOptional() @IsString() patientNumber?: string;
  @IsString() @MinLength(2) firstName!: string;
  @IsOptional() @IsString() middleName?: string;
  @IsString() @MinLength(2) lastName!: string;
  @IsEnum(Sex) sex!: Sex;
  @IsOptional() @Type(() => Date) @IsDate() dateOfBirth?: Date;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() governmentId?: string;
  @IsOptional() @IsString() emergencyContactName?: string;
  @IsOptional() @IsString() emergencyContactPhone?: string;
  @IsOptional() @IsString() allergies?: string;
}
export class UpdatePatientDto extends PartialType(
  OmitType(CreatePatientDto, ["patientNumber"] as const),
) {}
export class PatientQueryDto extends PaginationDto {
  @IsOptional() @IsString() search?: string;
}
