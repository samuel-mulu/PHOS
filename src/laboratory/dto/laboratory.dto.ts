import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import {
  EncounterPriority,
  LabResultFlag,
} from "../../generated/prisma/client";

export class CreateLabTestDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() referenceRange?: string;
  @Type(() => Number) @IsInt() @Min(0) priceCents!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateLabTestDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() referenceRange?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateLabTestStatusDto {
  @IsBoolean() active!: boolean;
}

export class CreateLabOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("4", { each: true })
  labTestIds!: string[];
  @IsOptional() @IsEnum(EncounterPriority) priority?: EncounterPriority;
  @IsOptional() @IsString() clinicalNotes?: string;
  /** Pay at cashier first; lab queue only after payment. */
  @IsOptional() @IsBoolean() billFirst?: boolean;
  /** billFirst only: doctor asks the cashier to make this much free. */
  @IsOptional() @IsInt() @Min(0) freeCents?: number;
  @IsOptional() @IsString() @MaxLength(500) freeReason?: string;
}
export class ResultValueDto {
  @IsUUID() labOrderItemId!: string;
  @IsString() value!: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() referenceRange?: string;
  @IsOptional() @IsEnum(LabResultFlag) flag?: LabResultFlag;
  @IsOptional() @IsString() notes?: string;
}
export class EnterLabResultsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ResultValueDto)
  results!: ResultValueDto[];
}

export class SaveDoctorLabNotesDto {
  @IsString()
  doctorReviewNotes!: string;
}
