import { Module } from "@nestjs/common";
import { EncountersModule } from "../encounters/encounters.module";
import { QueuesController } from "./queues.controller";
import { QueuesService } from "./queues.service";
@Module({
  imports: [EncountersModule],
  controllers: [QueuesController],
  providers: [QueuesService],
  exports: [QueuesService],
})
export class QueuesModule {}
