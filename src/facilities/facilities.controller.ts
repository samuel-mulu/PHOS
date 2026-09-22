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
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "../generated/prisma/client";
import {
  CreateDepartmentDto,
  CreateFacilityDto,
  CreateServiceDto,
  UpdateCatalogStatusDto,
} from "./dto/facility.dto";
import { FacilitiesService } from "./facilities.service";
@ApiTags("Facilities")
@ApiBearerAuth()
@Controller()
export class FacilitiesController {
  constructor(private readonly service: FacilitiesService) {}
  @Get("facilities") facilities() {
    return this.service.facilities();
  }
  @Roles(Role.CEO, Role.ADMIN) @Post("facilities") createFacility(
    @Body() dto: CreateFacilityDto,
  ) {
    return this.service.createFacility(dto);
  }
  @Get("departments") departments(@Query("facilityId") facilityId?: string) {
    return this.service.departments(facilityId);
  }
  @Roles(Role.CEO, Role.ADMIN) @Post("departments") createDepartment(
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.service.createDepartment(dto);
  }
  @Roles(Role.CEO, Role.ADMIN)
  @Patch("departments/:id/status")
  updateDepartment(
    @Param("id") id: string,
    @Body() dto: UpdateCatalogStatusDto,
  ) {
    return this.service.updateDepartmentStatus(id, dto.active);
  }
  @Get("services") services(@Query("departmentId") departmentId?: string) {
    return this.service.services(departmentId);
  }
  @Roles(Role.CEO, Role.ADMIN) @Post("services") createService(
    @Body() dto: CreateServiceDto,
  ) {
    return this.service.createService(dto);
  }
  @Roles(Role.CEO, Role.ADMIN) @Patch("services/:id/status") updateService(
    @Param("id") id: string,
    @Body() dto: UpdateCatalogStatusDto,
  ) {
    return this.service.updateServiceStatus(id, dto.active);
  }
}
