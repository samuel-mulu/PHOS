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
import { AuthUser } from "../common/types/auth-user";
import { LabOrderStatus, Role } from "../generated/prisma/client";
import {
  CreateLabOrderDto,
  CreateLabTestDto,
  EnterLabResultsDto,
  UpdateLabTestDto,
  UpdateLabTestStatusDto,
} from "./dto/laboratory.dto";
import { LaboratoryService } from "./laboratory.service";

@ApiTags("Laboratory")
@ApiBearerAuth()
@Controller()
export class LaboratoryController {
  constructor(private readonly service: LaboratoryService) {}

  @Roles(Role.DOCTOR, Role.ADMIN, Role.CEO)
  @Post("consultations/:consultationId/lab-orders")
  create(
    @Param("consultationId") id: string,
    @Body() dto: CreateLabOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createOrder(id, dto, user.id, user.role);
  }

  /** Active catalog for ordering (doctor / lab). */
  @Roles(Role.DOCTOR, Role.LAB_TECH, Role.LAB_SUPERVISOR, Role.ADMIN, Role.CEO)
  @Get("lab/tests")
  tests() {
    return this.service.listTests();
  }

  /** Full catalog including inactive — admin management. */
  @Roles(Role.CEO, Role.ADMIN)
  @Get("lab/tests/admin")
  adminTests() {
    return this.service.listAllTests();
  }

  @Roles(Role.CEO, Role.ADMIN)
  @Post("lab/tests")
  createTest(@Body() dto: CreateLabTestDto) {
    return this.service.createTest(dto);
  }

  @Roles(Role.CEO, Role.ADMIN)
  @Patch("lab/tests/:id")
  updateTest(@Param("id") id: string, @Body() dto: UpdateLabTestDto) {
    return this.service.updateTest(id, dto);
  }

  @Roles(Role.CEO, Role.ADMIN)
  @Patch("lab/tests/:id/status")
  setTestStatus(
    @Param("id") id: string,
    @Body() dto: UpdateLabTestStatusDto,
  ) {
    return this.service.setTestActive(id, dto.active);
  }

  @Roles(Role.LAB_TECH, Role.LAB_SUPERVISOR, Role.DOCTOR, Role.ADMIN, Role.CEO)
  @Get("lab/orders")
  list(@Query("status") status?: LabOrderStatus) {
    return this.service.listOrders(status);
  }

  @Get("lab/orders/:id")
  find(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOrder(id, user.role);
  }

  @Roles(Role.LAB_TECH, Role.LAB_SUPERVISOR)
  @Post("lab/orders/:id/receive")
  receive(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.receive(id, user.id);
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

  @Roles(Role.LAB_SUPERVISOR)
  @Post("lab/orders/:id/verify")
  verify(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.verify(id, user.id);
  }
}
