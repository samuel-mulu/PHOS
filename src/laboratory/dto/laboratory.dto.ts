import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";
import {
  EncounterPriority,
  LabResultFlag,
} from "../../generated/prisma/client";
export class CreateLabOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("4", { each: true })
  labTestIds!: string[];
  @IsOptional() @IsEnum(EncounterPriority) priority?: EncounterPriority;
  @IsOptional() @IsString() clinicalNotes?: string;
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
