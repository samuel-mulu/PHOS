import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { Role } from "../generated/prisma/client";
import {
  AddDiagnosisDto,
  CorrectConsultationDto,
  SaveConsultationDto,
} from "./dto/consultation.dto";
import { ConsultationsService } from "./consultations.service";
@ApiTags("Consultations")
@ApiBearerAuth()
@Controller()
export class ConsultationsController {
  constructor(private readonly service: ConsultationsService) {}
  @Get("encounters/:encounterId/consultation") find(
    @Param("encounterId") id: string,
  ) {
    return this.service.findByEncounter(id);
  }
  @Roles(Role.CEO, Role.ADMIN, Role.DOCTOR)
  @Post("encounters/:encounterId/consultation")
  save(
    @Param("encounterId") id: string,
    @Body() dto: SaveConsultationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.save(id, dto, user.id);
  }
  @Roles(Role.CEO, Role.ADMIN, Role.DOCTOR)
  @Post("consultations/:id/diagnoses")
  diagnosis(
    @Param("id") id: string,
    @Body() dto: AddDiagnosisDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addDiagnosis(id, dto, user.id);
  }
  @Roles(Role.CEO, Role.ADMIN, Role.DOCTOR)
  @Post("consultations/:id/finalize")
  finalize(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.finalize(id, user.id);
  }
  @Roles(Role.CEO, Role.ADMIN, Role.DOCTOR)
  @Patch("consultations/:id/correct")
  correct(
    @Param("id") id: string,
    @Body() dto: CorrectConsultationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.correct(id, dto, user.id);
  }
}
