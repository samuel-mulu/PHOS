import { IsInt, IsOptional, IsString, Min } from "class-validator";
export class OpenCashSessionDto {
  @IsInt() @Min(0) openingFloatCents = 0;
}
export class CloseCashSessionDto {
  @IsInt() @Min(0) actualCashCents!: number;
  @IsOptional() @IsString() notes?: string;
}
