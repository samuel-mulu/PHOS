import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { Role } from "../generated/prisma/client";
import {
  CreateFamilyPlanningDto,
  UpdateFamilyPlanningDto,
} from "./dto/family-planning.dto";
import { FamilyPlanningService } from "./family-planning.service";

const WRITE_ROLES = [Role.CEO, Role.ADMIN, Role.DOCTOR, Role.NURSE] as const;

@ApiTags("Family Planning")
@ApiBearerAuth()
@Controller()
export class FamilyPlanningController {
  constructor(private readonly service: FamilyPlanningService) {}

  @Get("patients/:patientId/family-planning")
  listByPatient(@Param("patientId") patientId: string) {
    return this.service.listByPatient(patientId);
  }

  @Roles(...WRITE_ROLES)
  @Post("patients/:patientId/family-planning")
  create(
    @Param("patientId") patientId: string,
    @Body() dto: CreateFamilyPlanningDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(patientId, dto, user.id);
  }

  @Roles(...WRITE_ROLES)
  @Put("family-planning/:id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateFamilyPlanningDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user.id);
  }
}
