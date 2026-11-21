import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";
import { PaymentMethod } from "../../generated/prisma/client";

export class CreateOtherIncomeDto {
  /** Existing source. Omit when `newSourceName` is given. */
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  /** "Other" typed by staff: creates (or reuses) a source with this name. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  newSourceName?: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsDateString()
  incomeDate!: string;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  payer?: string;

  /** Reason / notes for the income. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiptReference?: string;
}

export class VoidOtherIncomeDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class CreateOtherIncomeSourceDto {
  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateOtherIncomeSourceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
