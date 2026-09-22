import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { LabOrderStatus, Role } from "../generated/prisma/client";
import { CreateLabOrderDto, EnterLabResultsDto } from "./dto/laboratory.dto";
import { LaboratoryService } from "./laboratory.service";
@ApiTags("Laboratory")
@ApiBearerAuth()
@Controller()
export class LaboratoryController {
  constructor(private readonly service: LaboratoryService) {}
  @Roles(Role.DOCTOR)
  @Post("consultations/:consultationId/lab-orders")
  create(
    @Param("consultationId") id: string,
    @Body() dto: CreateLabOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createOrder(id, dto, user.id);
  }
  @Roles(Role.DOCTOR, Role.LAB_TECH, Role.LAB_SUPERVISOR, Role.ADMIN, Role.CEO)
  @Get("lab/tests")
  tests() {
    return this.service.listTests();
  }
  @Roles(Role.LAB_TECH, Role.LAB_SUPERVISOR, Role.DOCTOR, Role.ADMIN, Role.CEO)
  @Get("lab/orders")
  list(@Query("status") status?: LabOrderStatus) {
    return this.service.listOrders(status);
  }
  @Get("lab/orders/:id") find(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findOrder(id, user.role);
  }
  @Roles(Role.LAB_TECH, Role.LAB_SUPERVISOR)
  @Post("lab/orders/:id/results")
  enter(
    @Param("id") id: string,
    @Body() dto: EnterLabResultsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.enterResults(id, dto, user.id);
  }
  @Roles(Role.LAB_SUPERVISOR) @Post("lab/orders/:id/verify") verify(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.verify(id, user.id);
  }
}
