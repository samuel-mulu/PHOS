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
import { DESK_REGISTER_ROLES } from "../common/constants/desk-roles";
import { AuthUser } from "../common/types/auth-user";
import { AppointmentStatus, Role } from "../generated/prisma/client";
import {
  CreateAppointmentDto,
  LinkAppointmentEncounterDto,
  UpdateAppointmentStatusDto,
} from "./dto/appointment.dto";
import { AppointmentsService } from "./appointments.service";

@ApiTags("Appointments")
@ApiBearerAuth()
@Controller("appointments")
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  @Roles(
    Role.CEO,
    Role.ADMIN,
    Role.RECEPTIONIST,
    Role.FRONT_DESK,
    Role.DOCTOR,
    Role.REPORTING_OFFICER,
  )
  @Get()
  list(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("status") status?: AppointmentStatus,
  ) {
    return this.service.list({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      status,
    });
  }

  @Roles(...DESK_REGISTER_ROLES, Role.DOCTOR)
  @Post()
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id);
  }

  @Roles(...DESK_REGISTER_ROLES)
  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateAppointmentStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateStatus(id, dto.status, user.id);
  }

  @Roles(...DESK_REGISTER_ROLES)
  @Post(":id/check-in")
  checkIn(
    @Param("id") id: string,
    @Body() dto: LinkAppointmentEncounterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.linkEncounter(id, dto.encounterId, user.id);
  }
}
