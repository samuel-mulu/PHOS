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
import { QueueStation, Role } from "../generated/prisma/client";
import { CreateQueueEntryDto, UpdateQueueEntryDto } from "./dto/queue.dto";
import { QueuesService } from "./queues.service";
@ApiTags("Queues")
@ApiBearerAuth()
@Controller()
export class QueuesController {
  constructor(private readonly service: QueuesService) {}
  @Get("queues/:station") list(
    @Param("station") station: QueueStation,
    @Query("assignedToId") assignedToId?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const forDoctorId =
      station === "DOCTOR" && user?.role === Role.DOCTOR ? user.id : undefined;
    return this.service.list(station, assignedToId, forDoctorId);
  }
  @Roles(Role.CEO, Role.ADMIN, Role.RECEPTIONIST, Role.FRONT_DESK, Role.NURSE, Role.DOCTOR)
  @Post("queue-entries")
  create(@Body() dto: CreateQueueEntryDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id);
  }
  @Roles(
    Role.CEO,
    Role.ADMIN,
    Role.RECEPTIONIST,
    Role.NURSE,
    Role.DOCTOR,
    Role.LAB_TECH,
    Role.PHARMACIST,
    Role.CASHIER,
    Role.FRONT_DESK,
  )
  @Patch("queue-entries/:id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateQueueEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user.id);
  }
}
