import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { ClinicalMessagesModule } from "../clinical-messages/clinical-messages.module";
import { EncountersModule } from "../encounters/encounters.module";
import { LaboratoryController } from "./laboratory.controller";
import { LaboratoryService } from "./laboratory.service";
@Module({
  imports: [BillingModule, EncountersModule, ClinicalMessagesModule],
  controllers: [LaboratoryController],
  providers: [LaboratoryService],
  exports: [LaboratoryService],
})
export class LaboratoryModule {}
