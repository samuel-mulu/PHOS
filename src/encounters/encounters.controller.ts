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
import { EncounterStatus, Role } from "../generated/prisma/client";
import {
  CreateEncounterDto,
  TransitionEncounterDto,
} from "./dto/encounter.dto";
import { EncountersService } from "./encounters.service";
@ApiTags("Encounters")
@ApiBearerAuth()
@Controller("encounters")
export class EncountersController {
  constructor(private readonly service: EncountersService) {}
  @Roles(Role.CEO, Role.ADMIN, Role.RECEPTIONIST) @Post() create(
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
  @Roles(Role.CEO, Role.ADMIN, Role.RECEPTIONIST, Role.NURSE, Role.DOCTOR)
  @Patch(":id/status")
  transition(
    @Param("id") id: string,
    @Body() dto: TransitionEncounterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.transition(id, dto.status, user.id);
  }
}
