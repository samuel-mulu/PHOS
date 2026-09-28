import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { DESK_PAY_ROLES } from "../common/constants/desk-roles";
import { Role } from "../generated/prisma/client";
import { CashSessionsService } from "./cash-sessions.service";
import {
  CloseCashSessionDto,
  OpenCashSessionDto,
} from "./dto/cash-session.dto";
@ApiTags("Cash Sessions")
@ApiBearerAuth()
@Roles(...DESK_PAY_ROLES)
@Controller("cash-sessions")
export class CashSessionsController {
  constructor(private readonly service: CashSessionsService) {}
  @Post("open") open(
    @Body() dto: OpenCashSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.open(dto, user.id);
  }
  @Get("current") current(@CurrentUser() user: AuthUser) {
    return this.service.current(user.id);
  }
  @Post(":id/close") close(
    @Param("id") id: string,
    @Body() dto: CloseCashSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.close(id, dto, user.id);
  }
}
