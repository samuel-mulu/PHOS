import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { DESK_PAY_ROLES } from "../common/constants/desk-roles";
import { CreatePaymentDto, CreateRefundDto } from "./dto/payment.dto";
import { PaymentsService } from "./payments.service";

@ApiTags("Payments")
@ApiBearerAuth()
@Controller("payments")
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Roles(...DESK_PAY_ROLES)
  @Post()
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id);
  }

  @Roles(...DESK_PAY_ROLES)
  @Get("report")
  report(@Query("from") from: string, @Query("to") to: string) {
    const start = from
      ? new Date(from)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const end = to ? new Date(to) : new Date();
    return this.service.report(start, end);
  }

  @Get(":id")
  find(@Param("id") id: string) {
    return this.service.find(id);
  }

  @Roles(...DESK_PAY_ROLES)
  @Post(":id/refunds")
  refund(
    @Param("id") id: string,
    @Body() dto: CreateRefundDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.refund(id, dto, user.id);
  }
}
