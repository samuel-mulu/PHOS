import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { Role } from "../generated/prisma/client";
import { ClinicalMessagesService } from "./clinical-messages.service";
import { CreateClinicalMessageDto } from "./dto/clinical-message.dto";

const READ_ROLES = [
  Role.CEO,
  Role.ADMIN,
  Role.DOCTOR,
  Role.NURSE,
  Role.LAB_TECH,
  Role.LAB_SUPERVISOR,
] as const;

const WRITE_ROLES = [
  Role.CEO,
  Role.ADMIN,
  Role.DOCTOR,
  Role.NURSE,
  Role.LAB_TECH,
  Role.LAB_SUPERVISOR,
] as const;

@ApiTags("Clinical Messages")
@ApiBearerAuth()
@Controller()
export class ClinicalMessagesController {
  constructor(private readonly service: ClinicalMessagesService) {}

  @Roles(...READ_ROLES)
  @Get("encounters/:encounterId/clinical-messages")
  listByEncounter(@Param("encounterId") encounterId: string) {
    return this.service.listByEncounter(encounterId);
  }

  @Roles(...READ_ROLES)
  @Get("patients/:patientId/clinical-messages")
  listByPatient(@Param("patientId") patientId: string) {
    return this.service.listByPatient(patientId);
  }

  @Roles(...WRITE_ROLES)
  @Post("encounters/:encounterId/clinical-messages")
  create(
    @Param("encounterId") encounterId: string,
    @Body() dto: CreateClinicalMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(encounterId, dto, user.id, user.role);
  }
}
