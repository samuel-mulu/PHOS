import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { PrescriptionStatus, Role } from "../generated/prisma/client";
import { CreatePrescriptionDto } from "./dto/prescription.dto";
import { PrescriptionsService } from "./prescriptions.service";
@ApiTags("Prescriptions")
@ApiBearerAuth()
@Controller()
export class PrescriptionsController {
  constructor(private readonly service: PrescriptionsService) {}
  @Roles(Role.DOCTOR)
  @Post("consultations/:consultationId/prescriptions")
  create(
    @Param("consultationId") id: string,
    @Body() dto: CreatePrescriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(id, dto, user.id);
  }
  @Get("prescriptions") list(@Query("status") status?: PrescriptionStatus) {
    return this.service.list(status);
  }
  @Get("prescriptions/:id") find(@Param("id") id: string) {
    return this.service.find(id);
  }
  @Roles(Role.DOCTOR)
  @Post("prescriptions/:id/cancel")
  cancel(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.cancel(id, user.id);
  }
}
