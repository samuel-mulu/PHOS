import { Type } from "class-transformer";
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
export class RecordTriageDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(30)
  @Max(45)
  temperature?: number;
  @IsOptional() @IsInt() @Min(40) @Max(300) systolic?: number;
  @IsOptional() @IsInt() @Min(20) @Max(200) diastolic?: number;
  @IsOptional() @IsInt() @Min(20) @Max(250) heartRate?: number;
  @IsOptional() @IsInt() @Min(5) @Max(80) respiratoryRate?: number;
  @IsOptional() @IsInt() @Min(50) @Max(100) spo2?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.2)
  @Max(500)
  weightKg?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(20)
  @Max(260)
  heightCm?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10) painScore?: number;
  @IsOptional() @IsString() notes?: string;
}
