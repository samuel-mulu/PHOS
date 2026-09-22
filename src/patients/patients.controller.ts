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
import { Role } from "../generated/prisma/client";
import {
  CreatePatientDto,
  PatientQueryDto,
  UpdatePatientDto,
} from "./dto/patient.dto";
import { PatientsService } from "./patients.service";
@ApiTags("Patients")
@ApiBearerAuth()
@Controller("patients")
export class PatientsController {
  constructor(private readonly service: PatientsService) {}
  @Roles(
    Role.CEO,
    Role.ADMIN,
    Role.RECEPTIONIST,
    Role.DOCTOR,
    Role.NURSE,
    Role.LAB_TECH,
    Role.LAB_SUPERVISOR,
    Role.PHARMACIST,
    Role.CASHIER,
  )
  @Get()
  list(@Query() query: PatientQueryDto) {
    return this.service.list(query);
  }
  @Roles(Role.CEO, Role.ADMIN, Role.RECEPTIONIST) @Post() create(
    @Body() dto: CreatePatientDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, user.id);
  }
  @Get(":id") find(@Param("id") id: string) {
    return this.service.findOne(id);
  }
  @Roles(Role.CEO, Role.ADMIN, Role.RECEPTIONIST) @Patch(":id") update(
    @Param("id") id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user.id);
  }
}
