import {
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

export class CreateExpenseDto {
  /** Existing category. Omit when `newCategoryName` is given. */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** "Other" typed by staff: creates (or reuses) a category with this name. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  newCategoryName?: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsDateString()
  expenseDate!: string;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiptReference?: string;
}

export class VoidExpenseDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class CreateExpenseCategoryDto {
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

export class UpdateExpenseCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  active?: boolean;
}
