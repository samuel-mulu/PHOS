import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from "class-validator";
export class CreateFacilityDto {
  @IsString() @MinLength(2) code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
}
export class CreateDepartmentDto {
  @IsUUID() facilityId!: string;
  @IsString() code!: string;
  @IsString() name!: string;
}
export class CreateServiceDto {
  @IsUUID() departmentId!: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsInt() @Min(0) priceCents!: number;
  @IsOptional() @IsInt() @Min(1) durationMinutes?: number;
}
export class UpdateCatalogStatusDto {
  @IsBoolean() active!: boolean;
}
export class UpdateServiceDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(0) priceCents?: number;
  @IsOptional() @IsInt() @Min(1) durationMinutes?: number;
}
