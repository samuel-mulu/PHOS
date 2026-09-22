import { Module } from "@nestjs/common";
import { LaboratoryController } from "./laboratory.controller";
import { LaboratoryService } from "./laboratory.service";
@Module({
  controllers: [LaboratoryController],
  providers: [LaboratoryService],
  exports: [LaboratoryService],
})
export class LaboratoryModule {}
