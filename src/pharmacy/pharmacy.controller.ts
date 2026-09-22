import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { Role } from "../generated/prisma/client";
import { DispensePrescriptionDto } from "./dto/pharmacy.dto";
import { PharmacyService } from "./pharmacy.service";
@ApiTags("Pharmacy")
@ApiBearerAuth()
@Controller("pharmacy")
export class PharmacyController {
  constructor(private readonly service: PharmacyService) {}
  @Roles(Role.PHARMACIST) @Post("prescriptions/:id/dispense") dispense(
    @Param("id") id: string,
    @Body() dto: DispensePrescriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.dispense(id, dto, user.id);
  }
}
