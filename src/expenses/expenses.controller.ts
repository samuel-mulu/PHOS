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
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseCategoryDto,
  VoidExpenseDto,
} from "./dto/expense.dto";
import { ExpensesService } from "./expenses.service";

const EXPENSE_READ_ROLES = [...DESK_PAY_ROLES, Role.REPORTING_OFFICER];
const EXPENSE_ADMIN_ROLES = [Role.CEO, Role.ADMIN];

@ApiTags("Expenses")
@ApiBearerAuth()
@Controller("expenses")
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Roles(...EXPENSE_READ_ROLES)
  @Get("categories")
  listCategories(@Query("all") all?: string) {
    return this.service.listCategories(all !== "1");
  }

  @Roles(...EXPENSE_ADMIN_ROLES)
  @Post("categories")
  createCategory(@Body() dto: CreateExpenseCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Roles(...EXPENSE_ADMIN_ROLES)
  @Patch("categories/:id")
  updateCategory(
    @Param("id") id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    return this.service.updateCategory(id, dto);
  }

  @Roles(...EXPENSE_READ_ROLES)
  @Get("report")
  report(@Query("from") from: string, @Query("to") to: string) {
    const start = from
      ? new Date(from)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const end = to ? new Date(to) : new Date();
    return this.service.report(start, end);
  }

  @Roles(...DESK_PAY_ROLES)
  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id);
  }

  @Roles(...EXPENSE_READ_ROLES)
  @Get()
  list(
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("status") status?: "RECORDED" | "VOIDED" | "ALL",
  ) {
    const start = from
      ? new Date(from)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const end = to ? new Date(to) : new Date();
    return this.service.list(start, end, status ?? "RECORDED");
  }

  @Roles(...DESK_PAY_ROLES)
  @Post(":id/void")
  voidExpense(
    @Param("id") id: string,
    @Body() dto: VoidExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.void(id, dto, user.id);
  }
}
