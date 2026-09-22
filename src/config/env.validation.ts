import { plainToInstance, Type } from "class-transformer";
import {
  IsBooleanString,
  IsInt,
  IsString,
  IsUrl,
  Min,
  MinLength,
  validateSync,
} from "class-validator";

class EnvironmentVariables {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  PORT = 4000;
  @IsUrl({ require_tld: false, protocols: ["postgresql"] })
  DATABASE_URL!: string;
  @IsString() @MinLength(32) JWT_ACCESS_SECRET!: string;
  @IsString() @MinLength(32) JWT_REFRESH_SECRET!: string;
  @IsString() JWT_ACCESS_TTL = "2h";
  @Type(() => Number)
  @IsInt()
  @Min(1)
  JWT_REFRESH_TTL_DAYS = 7;
  @IsString() CORS_ORIGINS = "http://localhost:3000";
  @IsBooleanString() COOKIE_SECURE = "false";
}
export function validateEnvironment(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length) throw new Error(errors.toString());
  return validated;
}
