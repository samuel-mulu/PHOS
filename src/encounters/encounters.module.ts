import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { EncountersController } from "./encounters.controller";
import { EncountersService } from "./encounters.service";
@Module({
  imports: [BillingModule],
  controllers: [EncountersController],
  providers: [EncountersService],
  exports: [EncountersService],
})
export class EncountersModule {}
