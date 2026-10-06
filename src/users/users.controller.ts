import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuditService } from "../audit/audit.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { Role } from "../generated/prisma/client";
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from "./dto/user.dto";
import { UsersService } from "./users.service";
@ApiTags("Users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}
  @Get("me") me(@CurrentUser() user: AuthUser) {
    return this.users.findOne(user.id);
  }
  @Roles(
    Role.CEO,
    Role.ADMIN,
    Role.RECEPTIONIST,
    Role.FRONT_DESK,
    Role.NURSE,
    Role.DOCTOR,
  )
  @Get("doctors")
  listDoctors() {
    return this.users.listDoctors();
  }
  @Roles(Role.CEO, Role.ADMIN, Role.IT_ADMIN) @Get() list(
    @Query("search") search?: string,
  ) {
    return this.users.list(search);
  }
  @Roles(Role.CEO, Role.ADMIN, Role.IT_ADMIN) @Post() async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    const item = await this.users.create(dto);
    await this.audit.create({
      actorId: actor.id,
      action: "user.created",
      entityType: "User",
      entityId: item.id,
    });
    return item;
  }
  @Roles(Role.CEO, Role.ADMIN, Role.IT_ADMIN) @Get(":id") find(
    @Param("id") id: string,
  ) {
    return this.users.findOne(id);
  }
  @Roles(Role.CEO, Role.ADMIN, Role.IT_ADMIN) @Patch(":id") async update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    const item = await this.users.update(id, dto);
    await this.audit.create({
      actorId: actor.id,
      action: "user.updated",
      entityType: "User",
      entityId: id,
      newValues: dto as never,
    });
    return item;
  }
  @Roles(Role.CEO, Role.ADMIN, Role.IT_ADMIN) @Patch(":id/status") async status(
    @Param("id") id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    const item = await this.users.updateStatus(id, dto.status, actor.id);
    await this.audit.create({
      actorId: actor.id,
      action: "user.status_changed",
      entityType: "User",
      entityId: id,
      newValues: { status: dto.status },
    });
    return item;
  }
}
