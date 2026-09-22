import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { InvoiceItemType } from "../../generated/prisma/client";
export class InvoiceItemDto {
  @IsEnum(InvoiceItemType) type!: InvoiceItemType;
  @IsString() description!: string;
  @IsOptional() @IsString() sourceId?: string;
  @IsInt() @Min(1) quantity = 1;
  @IsInt() @Min(0) unitPriceCents!: number;
}
export class CreateInvoiceDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  additionalItems: InvoiceItemDto[] = [];
  @IsOptional() @IsInt() @Min(0) discountCents = 0;
}
