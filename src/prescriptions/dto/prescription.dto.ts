import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
export class PrescriptionItemDto {
  @IsUUID() medicineId!: string;
  @IsString() dose!: string;
  @IsString() route!: string;
  @IsString() frequency!: string;
  @IsString() duration!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() instructions?: string;
}
export class CreatePrescriptionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items!: PrescriptionItemDto[];
  @IsOptional() @IsString() notes?: string;
  /** When true, put patient on pharmacy queue. When false, save Rx only. */
  @IsOptional() @IsBoolean() sendToPharmacy?: boolean;
}
