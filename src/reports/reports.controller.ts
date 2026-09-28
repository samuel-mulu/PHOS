import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../generated/prisma/client";
import { ReportsService } from "./reports.service";

@ApiTags("Reports")
@ApiBearerAuth()
@Controller("reports")
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Roles(Role.CEO, Role.ADMIN, Role.IT_ADMIN, Role.REPORTING_OFFICER)
  @Get("dashboard")
  dashboard() {
    return this.service.dashboard();
  }

  @Roles(Role.CEO, Role.ADMIN, Role.REPORTING_OFFICER)
  @Get("hmis")
  hmis(@Query("from") from: string, @Query("to") to: string) {
    const start = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = to ? new Date(to) : new Date();
    return this.service.hmis(start, end);
  }
}
