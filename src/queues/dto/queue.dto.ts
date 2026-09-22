import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { QueueStation, QueueStatus } from "../../generated/prisma/client";
export class CreateQueueEntryDto {
  @IsUUID() encounterId!: string;
  @IsEnum(QueueStation) station!: QueueStation;
  @IsOptional() @IsUUID() assignedToId?: string;
}
export class UpdateQueueEntryDto {
  @IsEnum(QueueStatus) status!: QueueStatus;
  @IsOptional() @IsUUID() assignedToId?: string;
}
