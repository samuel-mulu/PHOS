import { Type } from "class-transformer";
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";
export class CreateMedicineDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() genericName?: string;
  @IsOptional() @IsString() strength?: string;
  @IsOptional() @IsString() form?: string;
  @IsInt() @Min(0) sellingPriceCents!: number;
  @IsInt() @Min(0) reorderLevel = 0;
}
export class CreateSupplierDto {
  @IsString() name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
}
export class ReceiveStockDto {
  @IsUUID() medicineId!: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsString() batchNumber!: string;
  @Type(() => Date) @IsDate() expiryDate!: Date;
  @IsInt() @Min(1) quantity!: number;
  @IsInt() @Min(0) unitCostCents!: number;
}
export class AdjustStockDto {
  @IsUUID() batchId!: string;
  @IsInt() quantity!: number;
  @IsString() reason!: string;
}
