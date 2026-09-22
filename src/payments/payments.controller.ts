import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { Role } from "../generated/prisma/client";
import { CreatePaymentDto, CreateRefundDto } from "./dto/payment.dto";
import { PaymentsService } from "./payments.service";
@ApiTags("Payments")
@ApiBearerAuth()
@Controller("payments")
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}
  @Roles(Role.CASHIER, Role.ADMIN) @Post() create(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, user.id);
  }
  @Get(":id") find(@Param("id") id: string) {
    return this.service.find(id);
  }
  @Roles(Role.CASHIER, Role.ADMIN) @Post(":id/refunds") refund(
    @Param("id") id: string,
    @Body() dto: CreateRefundDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.refund(id, dto, user.id);
  }
}
