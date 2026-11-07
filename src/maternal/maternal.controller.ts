import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { Role } from "../generated/prisma/client";
import {
  CreateAncVisitDto,
  CreateLaborMonitoringDto,
  UpdateAncVisitDto,
  UpsertDeliverySummaryDto,
  UpsertLaborAdmissionDto,
  UpsertObstetricHistoryDto,
} from "./dto/maternal.dto";
import { MaternalService } from "./maternal.service";

const WRITE_ROLES = [Role.CEO, Role.ADMIN, Role.DOCTOR, Role.NURSE] as const;

@ApiTags("Maternal")
@ApiBearerAuth()
@Controller()
export class MaternalController {
  constructor(private readonly service: MaternalService) {}

  @Get("patients/:patientId/maternal")
  getPatientMaternal(@Param("patientId") patientId: string) {
    return this.service.getPatientMaternal(patientId);
  }

  @Roles(...WRITE_ROLES)
  @Put("patients/:patientId/obstetric-history")
  upsertObstetricHistory(
    @Param("patientId") patientId: string,
    @Body() dto: UpsertObstetricHistoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.upsertObstetricHistory(patientId, dto, user.id);
  }

  @Get("patients/:patientId/anc-visits")
  listAncVisits(@Param("patientId") patientId: string) {
    return this.service.listAncVisits(patientId);
  }

  @Roles(...WRITE_ROLES)
  @Post("patients/:patientId/anc-visits")
  createAncVisit(
    @Param("patientId") patientId: string,
    @Body() dto: CreateAncVisitDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createAncVisit(patientId, dto, user.id);
  }

  @Roles(...WRITE_ROLES)
  @Put("anc-visits/:id")
  updateAncVisit(
    @Param("id") id: string,
    @Body() dto: UpdateAncVisitDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateAncVisit(id, dto, user.id);
  }

  @Get("encounters/:encounterId/labor")
  getLabor(@Param("encounterId") encounterId: string) {
    return this.service.getLabor(encounterId);
  }

  @Roles(...WRITE_ROLES)
  @Put("encounters/:encounterId/labor")
  upsertLabor(
    @Param("encounterId") encounterId: string,
    @Body() dto: UpsertLaborAdmissionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.upsertLaborAdmission(encounterId, dto, user.id);
  }

  @Roles(...WRITE_ROLES)
  @Post("encounters/:encounterId/labor/monitoring")
  addLaborMonitoring(
    @Param("encounterId") encounterId: string,
    @Body() dto: CreateLaborMonitoringDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addLaborMonitoring(encounterId, dto, user.id);
  }

  @Get("encounters/:encounterId/delivery")
  getDelivery(@Param("encounterId") encounterId: string) {
    return this.service.getDelivery(encounterId);
  }

  @Roles(...WRITE_ROLES)
  @Put("encounters/:encounterId/delivery")
  upsertDelivery(
    @Param("encounterId") encounterId: string,
    @Body() dto: UpsertDeliverySummaryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.upsertDeliverySummary(encounterId, dto, user.id);
  }
}
