import { Module } from "@nestjs/common";
import { FamilyPlanningController } from "./family-planning.controller";
import { FamilyPlanningService } from "./family-planning.service";

@Module({
  controllers: [FamilyPlanningController],
  providers: [FamilyPlanningService],
})
export class FamilyPlanningModule {}
