import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from "class-validator";
import { PaymentMethod } from "../../generated/prisma/client";
export class CreatePaymentDto {
  @IsUUID() idempotencyKey!: string;
  @IsUUID() invoiceId!: string;
  @IsInt() @Min(1) amountCents!: number;
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsUUID() cashSessionId?: string;
}
export class CreateRefundDto {
  @IsUUID() idempotencyKey!: string;
  @IsInt() @Min(1) amountCents!: number;
  @IsString() @MinLength(5) reason!: string;
}
