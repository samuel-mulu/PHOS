import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { PaymentMethod } from "../../generated/prisma/client";

/** What to do with the patient when a payment leaves money unpaid. */
export const AFTER_PAYMENT = ["RELEASE", "WAIT"] as const;
export type AfterPayment = (typeof AFTER_PAYMENT)[number];

export class CreatePaymentDto {
  @IsUUID() idempotencyKey!: string;
  @IsUUID() invoiceId!: string;
  @IsInt() @Min(1) amountCents!: number;
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @IsOptional() @IsString() referenceNumber?: string;
  @IsOptional() @IsUUID() cashSessionId?: string;
  /**
   * Partial payment only: RELEASE sends the patient back and records the rest
   * as pay-later debt; WAIT (default) keeps the patient at the cashier.
   */
  @IsOptional() @IsIn(AFTER_PAYMENT) afterPayment?: AfterPayment;
  /** Required when afterPayment = RELEASE leaves a balance. */
  @ValidateIf((o: CreatePaymentDto) => o.afterPayment === "RELEASE")
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  deferReason?: string;
}

export class CreateRefundDto {
  @IsUUID() idempotencyKey!: string;
  @IsInt() @Min(1) amountCents!: number;
  @IsString() @MinLength(5) reason!: string;
}

export class DeferInvoiceDto {
  @IsUUID() idempotencyKey!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class WaiveInvoiceDto {
  @IsUUID() idempotencyKey!: string;
  @IsInt() @Min(1) amountCents!: number;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
