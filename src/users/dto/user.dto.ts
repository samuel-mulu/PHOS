import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import { Role, UserStatus } from "../../generated/prisma/client";
export class CreateUserDto {
  @IsEmail() email!: string;
  @IsOptional() @IsPhoneNumber("ET") phone?: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsEnum(Role) role!: Role;
  @IsOptional() @IsUUID() departmentId?: string;
}
export class UpdateUserDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsPhoneNumber("ET") phone?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsUUID() departmentId?: string;
}
export class UpdateUserStatusDto {
  @IsEnum(UserStatus) status!: UserStatus;
}
