import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import {
  ClinicalMessageKind,
} from "../../generated/prisma/client";

export class CreateClinicalMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsEnum(ClinicalMessageKind)
  kind?: ClinicalMessageKind;

  @IsOptional()
  @IsUUID()
  labOrderId?: string;
}
