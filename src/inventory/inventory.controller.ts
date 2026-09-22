import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuthUser } from "../common/types/auth-user";
import { Role } from "../generated/prisma/client";
import {
  AdjustStockDto,
  CreateMedicineDto,
  CreateSupplierDto,
  ReceiveStockDto,
} from "./dto/inventory.dto";
import { InventoryService } from "./inventory.service";
@ApiTags("Inventory")
@ApiBearerAuth()
@Controller("inventory")
export class InventoryController {
  constructor(private readonly service: InventoryService) {}
  @Get("medicines") medicines() {
    return this.service.medicines();
  }
  @Roles(Role.ADMIN) @Post("medicines") createMedicine(
    @Body() dto: CreateMedicineDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createMedicine(dto, user.id);
  }
  @Roles(Role.ADMIN, Role.STOREKEEPER) @Post("suppliers") supplier(
    @Body() dto: CreateSupplierDto,
  ) {
    return this.service.createSupplier(dto);
  }
  @Roles(Role.ADMIN, Role.STOREKEEPER) @Post("receipts") receive(
    @Body() dto: ReceiveStockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.receive(dto, user.id);
  }
  @Roles(Role.ADMIN, Role.STOREKEEPER) @Post("adjustments") adjust(
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.adjust(dto, user.id);
  }
  @Get("stock") stock() {
    return this.service.stock();
  }
  @Get("low-stock") low() {
    return this.service.lowStock();
  }
  @Get("expiring") expiring() {
    return this.service.expiring();
  }
}
