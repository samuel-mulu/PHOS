import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { Role } from "../generated/prisma/client";
import { DESK_BILLING_CREATE_ROLES, DESK_PAY_ROLES } from "../common/constants/desk-roles";
import { BillingService } from "./billing.service";
import { CreateInvoiceDto } from "./dto/billing.dto";
@ApiTags("Billing")
@ApiBearerAuth()
@Controller()
export class BillingController {
  constructor(private readonly service: BillingService) {}
  @Roles(...DESK_BILLING_CREATE_ROLES)
  @Post("encounters/:encounterId/invoice")
  create(
    @Param("encounterId") id: string,
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(id, dto, user.id);
  }
  @Get("invoices/:id") find(@Param("id") id: string) {
    return this.service.find(id);
  }
  @Roles(...DESK_PAY_ROLES) @Post("invoices/:id/issue") issue(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.issue(id, user.id);
  }
  @Roles(Role.ADMIN) @Post("invoices/:id/void") voidInvoice(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.voidInvoice(id, user.id);
  }
}
