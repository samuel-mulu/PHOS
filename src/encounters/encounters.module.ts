import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { ClinicalMessagesModule } from "../clinical-messages/clinical-messages.module";
import { EncountersController } from "./encounters.controller";
import { EncountersService } from "./encounters.service";
@Module({
  imports: [BillingModule, ClinicalMessagesModule],
  controllers: [EncountersController],
  providers: [EncountersService],
  exports: [EncountersService],
})
export class EncountersModule {}
