import { Module } from "@nestjs/common";
import { ClinicalMessagesController } from "./clinical-messages.controller";
import { ClinicalMessagesService } from "./clinical-messages.service";

@Module({
  controllers: [ClinicalMessagesController],
  providers: [ClinicalMessagesService],
  exports: [ClinicalMessagesService],
})
export class ClinicalMessagesModule {}
