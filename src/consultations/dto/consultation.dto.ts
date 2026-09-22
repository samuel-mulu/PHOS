import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { DiagnosisType } from "../../generated/prisma/client";
export class SaveConsultationDto {
  @IsOptional() @IsString() chiefComplaint?: string;
  @IsOptional() @IsString() historyPresentIllness?: string;
  @IsOptional() @IsString() physicalExam?: string;
  @IsOptional() @IsString() assessment?: string;
  @IsOptional() @IsString() plan?: string;
  @IsOptional() @IsString() notes?: string;
}
export class AddDiagnosisDto {
  @IsOptional() @IsString() code?: string;
  @IsString() @MinLength(2) label!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(DiagnosisType) type?: DiagnosisType;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}
export class CorrectConsultationDto extends SaveConsultationDto {
  @IsString() @MinLength(5) correctionReason!: string;
}
