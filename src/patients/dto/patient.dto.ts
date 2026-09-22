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
import { PartialType } from "@nestjs/swagger";
export class CreatePatientDto {
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
export class UpdatePatientDto extends PartialType(CreatePatientDto) {}
export class PatientQueryDto extends PaginationDto {
  @IsOptional() @IsString() search?: string;
}
