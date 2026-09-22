import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { Role } from "../generated/prisma/client";
import { RecordTriageDto } from "./dto/triage.dto";
import { TriageService } from "./triage.service";
@ApiTags("Triage")
@ApiBearerAuth()
@Controller("encounters/:encounterId/triage")
export class TriageController {
  constructor(private readonly service: TriageService) {}
  @Get() find(@Param("encounterId") id: string) {
    return this.service.find(id);
  }
  @Roles(Role.CEO, Role.ADMIN, Role.NURSE) @Put() record(
    @Param("encounterId") id: string,
    @Body() dto: RecordTriageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.record(id, dto, user.id);
  }
}
