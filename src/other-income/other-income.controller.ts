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
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { DESK_PAY_ROLES } from "../common/constants/desk-roles";
import { AuthUser } from "../common/types/auth-user";
import { Role } from "../generated/prisma/client";
import {
  CreateOtherIncomeDto,
  CreateOtherIncomeSourceDto,
  UpdateOtherIncomeSourceDto,
  VoidOtherIncomeDto,
} from "./dto/other-income.dto";
import { OtherIncomeService } from "./other-income.service";

const INCOME_READ_ROLES = [...DESK_PAY_ROLES, Role.REPORTING_OFFICER];
const INCOME_ADMIN_ROLES = [Role.CEO, Role.ADMIN];

function parseRange(from?: string, to?: string) {
  const start = from
    ? new Date(from)
    : new Date(new Date().setHours(0, 0, 0, 0));
  const end = to ? new Date(to) : new Date();
  return { start, end };
}

@ApiTags("Other income")
@ApiBearerAuth()
@Controller("other-income")
export class OtherIncomeController {
  constructor(private readonly service: OtherIncomeService) {}

  @Roles(...INCOME_READ_ROLES)
  @Get("sources")
  listSources(@Query("all") all?: string) {
    return this.service.listSources(all !== "1");
  }

  @Roles(...INCOME_ADMIN_ROLES)
  @Post("sources")
  createSource(@Body() dto: CreateOtherIncomeSourceDto) {
    return this.service.createSource(dto);
  }

  @Roles(...INCOME_ADMIN_ROLES)
  @Patch("sources/:id")
  updateSource(
    @Param("id") id: string,
    @Body() dto: UpdateOtherIncomeSourceDto,
  ) {
    return this.service.updateSource(id, dto);
  }

  @Roles(...INCOME_READ_ROLES)
  @Get("report")
  report(@Query("from") from: string, @Query("to") to: string) {
    const { start, end } = parseRange(from, to);
    return this.service.report(start, end);
  }

  @Roles(...DESK_PAY_ROLES)
  @Post()
  create(@Body() dto: CreateOtherIncomeDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id);
  }

  @Roles(...INCOME_READ_ROLES)
  @Get()
  list(
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("status") status?: "RECORDED" | "VOIDED" | "ALL",
  ) {
    const { start, end } = parseRange(from, to);
    return this.service.list(start, end, status ?? "RECORDED");
  }

  @Roles(...DESK_PAY_ROLES)
  @Post(":id/void")
  voidIncome(
    @Param("id") id: string,
    @Body() dto: VoidOtherIncomeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.void(id, dto, user.id);
  }
}
