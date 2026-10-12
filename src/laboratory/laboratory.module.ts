import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { EncountersModule } from "../encounters/encounters.module";
import { LaboratoryController } from "./laboratory.controller";
import { LaboratoryService } from "./laboratory.service";
@Module({
  imports: [BillingModule, EncountersModule],
  controllers: [LaboratoryController],
  providers: [LaboratoryService],
  exports: [LaboratoryService],
})
export class LaboratoryModule {}
