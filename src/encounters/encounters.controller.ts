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
import { DESK_REGISTER_ROLES } from "../common/constants/desk-roles";
import { EncounterStatus, Role } from "../generated/prisma/client";
import {
  CreateEncounterDto,
  AssignDoctorDto,
  RouteEncounterDto,
  TransitionEncounterDto,
} from "./dto/encounter.dto";
import { EncountersService } from "./encounters.service";
@ApiTags("Encounters")
@ApiBearerAuth()
@Controller("encounters")
export class EncountersController {
  constructor(private readonly service: EncountersService) {}
  @Roles(...DESK_REGISTER_ROLES) @Post() create(
    @Body() dto: CreateEncounterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, user.id);
  }
  @Get() list(
    @Query("status") status?: EncounterStatus,
    @Query("patientId") patientId?: string,
  ) {
    return this.service.list(status, patientId);
  }
  @Get(":id") find(@Param("id") id: string) {
    return this.service.findOne(id);
  }
  @Roles(Role.CEO, Role.ADMIN, Role.RECEPTIONIST, Role.FRONT_DESK, Role.NURSE, Role.DOCTOR)
  @Patch(":id/status")
  transition(
    @Param("id") id: string,
    @Body() dto: TransitionEncounterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.transition(id, dto.status, user.id);
  }
  @Roles(...DESK_REGISTER_ROLES, Role.NURSE, Role.DOCTOR)
  @Patch(":id/assign-doctor")
  assignDoctor(
    @Param("id") id: string,
    @Body() dto: AssignDoctorDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.assignDoctor(id, dto.assignedDoctorId, user.id);
  }
  @Roles(
    Role.CEO,
    Role.ADMIN,
    Role.RECEPTIONIST,
    Role.FRONT_DESK,
    Role.NURSE,
    Role.DOCTOR,
  )
  @Post(":id/route")
  route(
    @Param("id") id: string,
    @Body() dto: RouteEncounterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.route(
      id,
      dto.station,
      user.id,
      dto.assignedDoctorId,
    );
  }
  @Roles(Role.CEO, Role.ADMIN, Role.DOCTOR)
  @Post(":id/billing-request")
  requestBilling(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.requestBilling(id, user.id, user.role);
  }
}
